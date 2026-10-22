//! Local annotation entries. A renamed directory commits the image and note together.
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    sync::Mutex,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::core::app::commands::get_jan_data_folder_path;

static LOG_LOCK: Mutex<()> = Mutex::new(());
const MAX_IMAGE: usize = 20 * 1024 * 1024;
const SETTINGS: &str = "production-log-folder.json";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AnnotationEntry {
    id: String,
    created_at: String,
    note: String,
    page_url: String,
    screenshot: bool,
    captured_at: Option<String>,
}

#[derive(Serialize)]
pub struct LogSnapshot {
    folder: String,
    entries: Vec<AnnotationEntry>,
}

fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn regular(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(error)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Log entry must be a regular file".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Linked log files are not supported".into());
        }
    }
    Ok(())
}

fn directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(error)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("Log location must be a directory without links".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err("Linked log directories are not supported".into());
        }
    }
    Ok(())
}

fn folder(data: &Path) -> Result<PathBuf, String> {
    let setting = data.join(SETTINGS);
    let root: PathBuf = if setting.exists() {
        regular(&setting)?;
        serde_json::from_slice(&fs::read(setting).map_err(error)?).map_err(error)?
    } else {
        data.join("logs").join("Radium Production log")
    };
    if !root.is_absolute() {
        return Err("The production log folder must be absolute".into());
    }
    Ok(root)
}

fn prepare(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root).map_err(error)?;
    directory(root)?;
    let root = fs::canonicalize(root).map_err(error)?;
    let entries = root.join("entries");
    fs::create_dir_all(&entries).map_err(error)?;
    directory(&entries)?;
    if fs::canonicalize(&entries).map_err(error)?.parent() != Some(root.as_path()) {
        return Err("Log entries resolve outside the selected folder".into());
    }
    Ok(entries)
}

fn check_folder(data: &Path, expected: &str) -> Result<PathBuf, String> {
    let root = folder(data)?;
    if root.to_string_lossy() != expected {
        return Err(
            "The log folder changed. Reload the log before saving; your draft is preserved.".into(),
        );
    }
    Ok(root)
}

fn validate_id(id: &str) -> Result<(), String> {
    let uuid = uuid::Uuid::parse_str(id).map_err(error)?;
    if uuid.to_string() != id {
        return Err("Invalid annotation ID".into());
    }
    Ok(())
}

fn entry_dir(root: &Path, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    let entries = prepare(root)?;
    let entry = entries.join(id);
    directory(&entry)?;
    if fs::canonicalize(&entry).map_err(error)?.parent() != Some(entries.as_path()) {
        return Err("Annotation resolves outside the log folder".into());
    }
    Ok(entry)
}

fn png(bytes: &[u8]) -> Result<image::DynamicImage, String> {
    if bytes.len() > MAX_IMAGE || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Attach a PNG screenshot of at most 20 MB".into());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), image::ImageFormat::Png);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(16384);
    limits.max_image_height = Some(16384);
    limits.max_alloc = Some(192 * 1024 * 1024);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|_| "Screenshot could not be decoded within the image limits".into())
}

fn snapshot(data: &Path) -> Result<LogSnapshot, String> {
    let root = folder(data)?;
    snapshot_at(&root)
}

fn snapshot_at(root: &Path) -> Result<LogSnapshot, String> {
    let mut entries = Vec::new();
    if root.exists() {
        let directory = prepare(root)?;
        for item in fs::read_dir(directory).map_err(error)? {
            let item = item.map_err(error)?;
            let id = item.file_name().to_string_lossy().to_string();
            if validate_id(&id).is_err() {
                continue;
            }
            let entry = entry_dir(root, &id)?.join("entry.json");
            regular(&entry)?;
            if fs::metadata(&entry).map_err(error)?.len() > 128 * 1024 {
                return Err(format!("Annotation {id} exceeds the metadata limit"));
            }
            let record: AnnotationEntry =
                serde_json::from_slice(&fs::read(entry).map_err(error)?).map_err(error)?;
            if record.id != id {
                return Err("Annotation identity does not match its directory".into());
            }
            entries.push(record);
        }
    }
    entries.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| b.id.cmp(&a.id))
    });
    entries.truncate(50);
    Ok(LogSnapshot {
        folder: root.to_string_lossy().into_owned(),
        entries,
    })
}

fn save(
    data: &Path,
    expected: &str,
    note: String,
    page_url: String,
    screenshot: Option<String>,
    captured_at: Option<String>,
) -> Result<AnnotationEntry, String> {
    if note.trim().is_empty() || note.chars().count() > 16000 || page_url.len() > 4096 {
        return Err(
            "Enter a note of up to 16,000 characters and a page address of up to 4,096 bytes"
                .into(),
        );
    }
    if let Some(value) = &captured_at {
        let captured = chrono::DateTime::parse_from_rfc3339(value).map_err(error)?;
        if screenshot.is_none() || captured.timestamp() > chrono::Utc::now().timestamp() + 60 {
            return Err("Invalid screenshot capture time".into());
        }
    }
    let bytes = screenshot
        .map(|value| {
            if value.len() > MAX_IMAGE * 4 / 3 + 128 {
                return Err("Screenshot exceeds 20 MB".into());
            }
            let encoded = value
                .strip_prefix("data:image/png;base64,")
                .ok_or("Screenshot must be a PNG data URL")?;
            let bytes = STANDARD.decode(encoded).map_err(error)?;
            png(&bytes)?;
            Ok::<_, String>(bytes)
        })
        .transpose()?;
    let root = check_folder(data, expected)?;
    let entries = prepare(&root)?;
    let id = uuid::Uuid::new_v4().to_string();
    let temporary = entries.join(format!(".{id}.pending"));
    fs::create_dir(&temporary).map_err(error)?;
    let record = AnnotationEntry {
        id: id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        note,
        page_url,
        screenshot: bytes.is_some(),
        captured_at,
    };
    let result = (|| {
        if let Some(bytes) = bytes {
            fs::write(temporary.join("screenshot.png"), bytes).map_err(error)?;
        }
        fs::write(
            temporary.join("entry.json"),
            serde_json::to_vec_pretty(&record).map_err(error)?,
        )
        .map_err(error)?;
        let image = if record.screenshot {
            "\n\n![Screenshot attached to this annotation](screenshot.png)\n"
        } else {
            ""
        };
        fs::write(
            temporary.join("Annotating.md"),
            format!(
                "# Annotating — {}\n\n{}\n\nPage: {}\n\nScreenshot captured: {}{image}",
                record.created_at,
                record.note,
                record.page_url,
                record
                    .captured_at
                    .as_deref()
                    .unwrap_or("Not recorded (attached image or note only)")
            ),
        )
        .map_err(error)?;
        fs::rename(&temporary, entries.join(&id)).map_err(error)?;
        Ok(record)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&temporary);
    }
    result
}

#[tauri::command]
pub async fn get_production_log(app: AppHandle) -> Result<LogSnapshot, String> {
    let data = get_jan_data_folder_path(app);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOG_LOCK.lock().map_err(error)?;
        snapshot(&data)
    })
    .await
    .map_err(error)?
}

fn select_folder(data: &Path, selected: &Path) -> Result<LogSnapshot, String> {
    let root = fs::canonicalize(selected).map_err(error)?;
    prepare(&root)?;
    let loaded = snapshot_at(&root)?;
    fs::create_dir_all(data).map_err(error)?;
    let temporary = data.join(format!(".production-log-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        fs::write(&temporary, serde_json::to_vec(&root).map_err(error)?).map_err(error)?;
        fs::rename(&temporary, data.join(SETTINGS)).map_err(error)?;
        Ok(loaded)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub async fn choose_production_log_folder(app: AppHandle) -> Result<Option<LogSnapshot>, String> {
    let data = get_jan_data_folder_path(app);
    let selected = rfd::AsyncFileDialog::new()
        .set_title("Choose Radium Production log folder")
        .set_directory(folder(&data)?)
        .pick_folder()
        .await;
    let Some(selected) = selected else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOG_LOCK.lock().map_err(error)?;
        select_folder(&data, selected.path()).map(Some)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub async fn save_production_annotation(
    app: AppHandle,
    expected_folder: String,
    note: String,
    page_url: String,
    screenshot: Option<String>,
    captured_at: Option<String>,
) -> Result<AnnotationEntry, String> {
    let data = get_jan_data_folder_path(app);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOG_LOCK.lock().map_err(error)?;
        save(
            &data,
            &expected_folder,
            note,
            page_url,
            screenshot,
            captured_at,
        )
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub async fn production_annotation_image(
    app: AppHandle,
    expected_folder: String,
    id: String,
    full_size: bool,
) -> Result<String, String> {
    let data = get_jan_data_folder_path(app);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOG_LOCK.lock().map_err(error)?;
        annotation_image(&data, &expected_folder, &id, full_size)
    })
    .await
    .map_err(error)?
}

fn annotation_image(
    data: &Path,
    expected_folder: &str,
    id: &str,
    full_size: bool,
) -> Result<String, String> {
    let root = check_folder(data, expected_folder)?;
    let filename = entry_dir(&root, id)?.join("screenshot.png");
    regular(&filename)?;
    if fs::metadata(&filename).map_err(error)?.len() > MAX_IMAGE as u64 {
        return Err("Screenshot exceeds 20 MB".into());
    }
    let bytes = fs::read(filename).map_err(error)?;
    let image = png(&bytes)?;
    let bytes = if full_size {
        bytes
    } else {
        let mut output = Cursor::new(Vec::new());
        image
            .thumbnail(960, 960)
            .write_to(&mut output, image::ImageFormat::Png)
            .map_err(error)?;
        output.into_inner()
    };
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selected_folder_survives_reload_without_moving_existing_entries() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("app");
        let original = folder(&data).unwrap();
        save(
            &data,
            &original.to_string_lossy(),
            "Original note".into(),
            String::new(),
            None,
            None,
        )
        .unwrap();
        let selected = temp
            .path()
            .join("Debugging logs")
            .join("Radium Production log");
        fs::create_dir_all(&selected).unwrap();
        let chosen = select_folder(&data, &selected).unwrap();
        assert!(chosen.entries.is_empty());
        assert_eq!(snapshot(&data).unwrap().folder, chosen.folder);
        assert!(save(
            &data,
            &original.to_string_lossy(),
            "Stale draft".into(),
            String::new(),
            None,
            None
        )
        .is_err());
        assert_eq!(
            snapshot_at(&original).unwrap().entries[0].note,
            "Original note"
        );
        let entry = save(
            &data,
            &chosen.folder,
            "New note".into(),
            String::new(),
            None,
            None,
        )
        .unwrap();
        assert_eq!(snapshot(&data).unwrap().entries[0].id, entry.id);
    }

    #[test]
    fn invalid_selected_log_does_not_replace_the_previous_preference() {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("app");
        let old = folder(&data).unwrap();
        let bad = temp.path().join("bad");
        let entries = prepare(&bad).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        fs::create_dir(entries.join(&id)).unwrap();
        fs::write(entries.join(id).join("entry.json"), b"invalid metadata").unwrap();
        assert!(select_folder(&data, &bad).is_err());
        assert_eq!(folder(&data).unwrap(), old);
        assert!(!data.join(SETTINGS).exists());
    }

    #[test]
    fn refuses_linked_entry_directories() {
        let temp = tempfile::tempdir().unwrap();
        let root = folder(temp.path()).unwrap();
        let entries = prepare(&root).unwrap();
        let outside = temp.path().join("outside");
        fs::create_dir(&outside).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let linked = entries.join(&id);
        #[cfg(windows)]
        {
            let result = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&linked)
                .arg(&outside)
                .output()
                .unwrap();
            assert!(result.status.success());
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, &linked).unwrap();
        assert!(entry_dir(&root, &id).is_err());
        assert!(fs::read_dir(&outside).unwrap().next().is_none());
    }
    #[test]
    fn commits_screenshot_and_note_together_and_keeps_capture_time() {
        let temp = tempfile::tempdir().unwrap();
        let root = folder(temp.path()).unwrap();
        let mut encoded = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut encoded, image::ImageFormat::Png)
            .unwrap();
        let data_url = format!(
            "data:image/png;base64,{}",
            STANDARD.encode(encoded.into_inner())
        );
        let captured = "2026-10-01T12:00:00Z".to_string();
        let entry = save(
            temp.path(),
            &root.to_string_lossy(),
            "Fix this button".into(),
            "https://example.org".into(),
            Some(data_url),
            Some(captured.clone()),
        )
        .unwrap();
        let loaded = snapshot(temp.path()).unwrap();
        assert_eq!(loaded.entries.len(), 1);
        assert_eq!(loaded.entries[0].captured_at, Some(captured));
        let dir = entry_dir(&root, &entry.id).unwrap();
        assert!(dir.join("screenshot.png").is_file());
        assert!(fs::read_to_string(dir.join("Annotating.md"))
            .unwrap()
            .contains("![Screenshot"));
    }
    #[test]
    fn rejects_invalid_images_stale_folder_and_traversal_without_partial_entries() {
        let temp = tempfile::tempdir().unwrap();
        let root = folder(temp.path()).unwrap();
        assert!(save(
            temp.path(),
            &root.to_string_lossy(),
            "Draft".into(),
            String::new(),
            Some("data:image/png;base64,YmFk".into()),
            None
        )
        .is_err());
        assert!(!root.exists());
        assert!(save(
            temp.path(),
            "wrong folder",
            "Draft".into(),
            String::new(),
            None,
            None
        )
        .is_err());
        assert!(entry_dir(&root, "../escape").is_err());
        assert!(snapshot(temp.path()).unwrap().entries.is_empty());
    }
    #[test]
    fn ignores_uncommitted_entries_and_supports_notes_without_screenshots() {
        let temp = tempfile::tempdir().unwrap();
        let root = folder(temp.path()).unwrap();
        let entries = prepare(&root).unwrap();
        fs::create_dir(entries.join(".interrupted.pending")).unwrap();
        let entry = save(
            temp.path(),
            &root.to_string_lossy(),
            "Quick memory note".into(),
            String::new(),
            None,
            None,
        )
        .unwrap();
        assert!(!entry.screenshot);
        assert_eq!(snapshot(temp.path()).unwrap().entries.len(), 1);
    }
}
