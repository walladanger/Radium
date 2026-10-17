use std::path::{Component, Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Runtime};

use super::{
    authoring::{
        create_custom_skill, export_skill_archive, import_custom_skill, update_custom_skill,
        CreateAgentSkillRequest, UpdateAgentSkillRequest,
    },
    discovery::{parse_category_path, MAX_CATEGORY_DEPTH},
    global_skills_dir, load_registry, SkillListEntry, SkillRegistry,
};
use crate::core::app::commands::get_jan_data_folder_path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillDetail {
    #[serde(flatten)]
    pub entry: SkillListEntry,
    pub body: String,
    /// The files that come with the skill besides SKILL.md, for Preview.
    pub files: Vec<AgentSkillFile>,
}

/// The largest part of one bundled file shown in Preview.
pub(crate) const PREVIEW_FILE_MAX_BYTES: usize = 64 * 1024;
/// Preview lists at most this many bundled files.
const PREVIEW_MAX_FILES: usize = 50;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillFile {
    pub path: String,
    pub content: String,
    /// Cut to PREVIEW_FILE_MAX_BYTES because the file is larger.
    pub truncated: bool,
}

#[tauri::command]
pub async fn agent_list_skills<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<SkillListEntry>, String> {
    let data_folder = get_jan_data_folder_path(app_handle);
    Ok(load_registry(&data_folder)?.list_all())
}

#[tauri::command]
pub async fn agent_get_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle);
    let registry = load_registry(&data_folder)?;
    let entry = registry
        .entry(&name)
        .ok_or_else(|| format!("Skill `{name}` was not found"))?;
    let record = registry.get(&name);
    let files = match record {
        Some(record) => collect_skill_files(&record.root)?,
        None => Vec::new(),
    };
    Ok(AgentSkillDetail {
        entry,
        body: record.map(|record| record.body.clone()).unwrap_or_default(),
        files,
    })
}

#[tauri::command]
pub async fn agent_set_skill_enabled<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let data_folder = get_jan_data_folder_path(app_handle);
    let mut registry = load_registry(&data_folder)?;
    registry.set_enabled(&name, enabled)
}

/// The user reviewed this skill and chose Allow (Task 28, D36): record it as
/// reviewed exactly as it is now, and switch it on.
#[tauri::command]
pub async fn agent_approve_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle.clone());
    let mut registry = load_registry(&data_folder)?;
    registry.approve(&name)?;
    registry.set_enabled(&name, true)?;
    agent_get_skill(app_handle, name).await
}

#[tauri::command]
pub async fn agent_create_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    request: CreateAgentSkillRequest,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle.clone());
    let name = request.name.trim().to_string();
    tokio::task::spawn_blocking(move || create_custom_skill(&data_folder, request))
        .await
        .map_err(|error| format!("Agent skill creation task failed: {error}"))??;
    agent_get_skill(app_handle, name).await
}

#[tauri::command]
pub async fn agent_import_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    source_path: String,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle.clone());
    let source = PathBuf::from(source_path);
    let name = tokio::task::spawn_blocking(move || import_custom_skill(&data_folder, &source))
        .await
        .map_err(|error| format!("Agent skill import task failed: {error}"))??;
    agent_get_skill(app_handle, name).await
}

#[tauri::command]
pub async fn agent_update_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    request: UpdateAgentSkillRequest,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle.clone());
    let name = request.name.trim().to_string();
    let registry = load_registry(&data_folder)?;
    let record = registry
        .get(&name)
        .ok_or_else(|| format!("Skill `{name}` was not found or is invalid"))?;
    ensure_skill_can_be_edited(&name, record.reserved)?;
    let skill_dir = resolve_skill_directory(&data_folder, &record.relative_path, &name).await?;
    tokio::task::spawn_blocking(move || update_custom_skill(&skill_dir, request))
        .await
        .map_err(|error| format!("Agent skill update task failed: {error}"))??;
    agent_get_skill(app_handle, name).await
}

#[tauri::command]
pub async fn agent_export_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
    target_path: String,
) -> Result<(), String> {
    let data_folder = get_jan_data_folder_path(app_handle);
    let registry = load_registry(&data_folder)?;
    let record = registry
        .get(&name)
        .ok_or_else(|| format!("Skill `{name}` was not found or is invalid"))?;
    let skill_dir = resolve_skill_directory(&data_folder, &record.relative_path, &name).await?;
    let target = PathBuf::from(target_path);
    tokio::task::spawn_blocking(move || export_skill_archive(&skill_dir, &target))
        .await
        .map_err(|error| format!("Agent skill export task failed: {error}"))?
}

/// Delete a skill folder. `path` (its folder below the skills root, as listed)
/// picks one copy when two folders share a name; without it the loaded copy,
/// or else the only one, is deleted.
#[tauri::command]
pub async fn agent_delete_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
    path: Option<String>,
) -> Result<(), String> {
    let data_folder = get_jan_data_folder_path(app_handle);
    let registry = load_registry(&data_folder)?;
    let entry = match path.as_deref() {
        Some(path) => registry.entry_at(path).filter(|entry| entry.name == name),
        None => registry.entry(&name),
    }
    .ok_or_else(|| format!("Skill `{name}` was not found"))?;
    ensure_skill_can_be_deleted(&name, entry.reserved)?;
    let target = resolve_skill_directory(&data_folder, &entry.path, &name).await?;
    tokio::fs::remove_dir_all(&target)
        .await
        .map_err(|error| format!("Failed to delete skill `{name}`: {error}"))?;
    remove_empty_category_folders(&global_skills_dir(&data_folder), &target);
    Ok(())
}

/// Move a skill into a category folder (`graphics`, `graphics/logos`) below
/// the skills root, or back to the root with an empty `category`. Identity,
/// on/off state and review all follow the name, and the review fingerprint
/// covers paths inside the skill only, so nothing has to be allowed again.
/// Bundled skills can be moved too: seeding updates them where they are.
#[tauri::command]
pub async fn agent_move_skill<R: Runtime>(
    app_handle: AppHandle<R>,
    name: String,
    category: String,
) -> Result<AgentSkillDetail, String> {
    let data_folder = get_jan_data_folder_path(app_handle.clone());
    let registry = load_registry(&data_folder)?;
    let moved_name = name.clone();
    tokio::task::spawn_blocking(move || move_skill(&registry, &moved_name, &category))
        .await
        .map_err(|error| format!("Agent skill move task failed: {error}"))??;
    agent_get_skill(app_handle, name).await
}

fn move_skill(registry: &SkillRegistry, name: &str, category: &str) -> Result<(), String> {
    let record = registry
        .get(name)
        .ok_or_else(|| format!("Skill `{name}` was not found or is invalid"))?;
    let folder = parse_category_path(category)?;
    if folder == record.folder {
        return Ok(());
    }
    let root = registry.root();
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|error| format!("Failed to resolve Agent skills directory: {error}"))?;
    let source = canonical_skill_directory(&canonical_root, &record.relative_path, name)?;
    // Each folder on the way must be a category: a folder holding SKILL.md is
    // a skill, and a skill inside a skill is never discovered.
    let mut destination_parent = canonical_root.clone();
    for part in &folder {
        destination_parent.push(part);
        match std::fs::symlink_metadata(&destination_parent) {
            Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                return Err(format!("`{part}` exists and is not a category folder"));
            }
            Ok(_) if destination_parent.join("SKILL.md").exists() => {
                return Err(format!("`{part}` is a skill, not a category folder"));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Failed to inspect `{part}`: {error}")),
        }
    }
    let destination = destination_parent.join(name);
    if destination.exists() {
        return Err(format!(
            "A folder named `{name}` already exists in that category"
        ));
    }
    std::fs::create_dir_all(&destination_parent)
        .map_err(|error| format!("Failed to create category folder: {error}"))?;
    std::fs::rename(&source, &destination)
        .map_err(|error| format!("Failed to move skill `{name}`: {error}"))?;
    remove_empty_category_folders(&canonical_root, &source);
    Ok(())
}

/// After a skill folder leaves, remove the category folders it left empty,
/// innermost first, never the skills root itself.
fn remove_empty_category_folders(root: &Path, removed: &Path) {
    let mut current = removed.parent();
    for _ in 0..MAX_CATEGORY_DEPTH {
        let Some(directory) = current else { break };
        if directory == root || !directory.starts_with(root) {
            break;
        }
        // Fails, and stops, as soon as a folder still has something in it.
        if std::fs::remove_dir(directory).is_err() {
            break;
        }
        current = directory.parent();
    }
}

/// Code the skill can run: what a reviewer must see before allowing it.
fn is_runnable_preview_file(relative: &str) -> bool {
    relative.starts_with("scripts/")
        || matches!(
            Path::new(relative)
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some(
                "sh" | "bash"
                    | "ps1"
                    | "py"
                    | "js"
                    | "mjs"
                    | "cjs"
                    | "ts"
                    | "cmd"
                    | "bat"
                    | "rb"
                    | "pl"
            )
        )
}

/// The files that come with a skill besides its SKILL.md, for the review
/// screen's Preview (Task 28, D36): relative paths with `/` separators in a
/// fixed order, contents as text, each cut to PREVIEW_FILE_MAX_BYTES. A symbolic
/// link is shown as a link and never followed, so Preview cannot read outside
/// the skill.
///
/// Runnable files come first, then everything else, each group by path. Plain
/// alphabetical order let a large skill push its scripts past
/// PREVIEW_MAX_FILES: ui-styling's 98 files begin with bundled fonts, so its
/// two Python scripts never reached the screen a user approves.
fn collect_skill_files(skill_root: &Path) -> Result<Vec<AgentSkillFile>, String> {
    let mut entries = Vec::new();
    collect_preview_entries(skill_root, skill_root, &mut entries)?;
    entries.sort_by(|left, right| {
        is_runnable_preview_file(&right.0)
            .cmp(&is_runnable_preview_file(&left.0))
            .then_with(|| left.0.cmp(&right.0))
    });
    let mut files = Vec::new();
    for (relative, is_link) in entries
        .into_iter()
        .filter(|(relative, _)| relative != "SKILL.md")
        .take(PREVIEW_MAX_FILES)
    {
        let path = skill_root.join(&relative);
        if is_link {
            let target = std::fs::read_link(&path)
                .map_err(|error| format!("Failed to read link `{relative}`: {error}"))?;
            files.push(AgentSkillFile {
                path: relative,
                content: format!("(symbolic link to {})", target.display()),
                truncated: false,
            });
            continue;
        }
        let bytes = std::fs::read(&path)
            .map_err(|error| format!("Failed to read skill file `{relative}`: {error}"))?;
        let truncated = bytes.len() > PREVIEW_FILE_MAX_BYTES;
        let shown = &bytes[..bytes.len().min(PREVIEW_FILE_MAX_BYTES)];
        files.push(AgentSkillFile {
            path: relative,
            content: String::from_utf8_lossy(shown).into_owned(),
            truncated,
        });
    }
    Ok(files)
}

fn collect_preview_entries(
    root: &Path,
    directory: &Path,
    entries: &mut Vec<(String, bool)>,
) -> Result<(), String> {
    let listing = std::fs::read_dir(directory)
        .map_err(|error| format!("Failed to scan skill directory: {error}"))?;
    for entry in listing {
        let entry = entry.map_err(|error| format!("Failed to scan skill directory: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect skill file: {error}"))?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_preview_entries(root, &path, entries)?;
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .map_err(|error| format!("Skill file is outside its folder: {error}"))?
            .components()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        entries.push((relative, file_type.is_symlink()));
    }
    Ok(())
}

/// A listed skill path: plain folder names (no `..`, no root, no prefix),
/// at most one skill below MAX_CATEGORY_DEPTH category folders, ending in the
/// skill's own name.
fn is_skill_relative_path(relative: &str, name: &str) -> bool {
    let components = Path::new(relative).components().collect::<Vec<_>>();
    !components.is_empty()
        && components.len() <= MAX_CATEGORY_DEPTH + 1
        && components
            .iter()
            .all(|component| matches!(component, Component::Normal(_)))
        && components
            .last()
            .is_some_and(|last| last.as_os_str() == name)
}

/// Resolve a listed skill folder and prove it is where the listing says: the
/// canonical path must be the canonical root plus exactly those folder names,
/// so neither `..` nor a link or junction anywhere on the way can point a
/// delete, edit or move outside the skills root.
fn canonical_skill_directory(
    canonical_root: &Path,
    relative: &str,
    name: &str,
) -> Result<PathBuf, String> {
    if !is_skill_relative_path(relative, name) {
        return Err("Skill target must be a folder inside the skills root".into());
    }
    let expected = relative
        .split('/')
        .fold(canonical_root.to_path_buf(), |path, part| path.join(part));
    let canonical_target = std::fs::canonicalize(&expected)
        .map_err(|error| format!("Failed to resolve skill `{name}`: {error}"))?;
    if canonical_target != expected || canonical_target == canonical_root {
        return Err("Skill target is not inside the skills root".into());
    }
    Ok(canonical_target)
}

fn ensure_skill_can_be_deleted(name: &str, reserved: bool) -> Result<(), String> {
    if reserved {
        Err(format!("Bundled skill `{name}` cannot be deleted"))
    } else {
        Ok(())
    }
}

fn ensure_skill_can_be_edited(name: &str, reserved: bool) -> Result<(), String> {
    if reserved {
        Err(format!("Bundled skill `{name}` cannot be edited"))
    } else {
        Ok(())
    }
}

async fn resolve_skill_directory(
    data_folder: &Path,
    relative: &str,
    name: &str,
) -> Result<PathBuf, String> {
    let root = global_skills_dir(data_folder);
    let canonical_root = tokio::fs::canonicalize(&root)
        .await
        .map_err(|error| format!("Failed to resolve Agent skills directory: {error}"))?;
    let relative = relative.to_string();
    let name = name.to_string();
    tokio::task::spawn_blocking(move || {
        canonical_skill_directory(&canonical_root, &relative, &name)
    })
    .await
    .map_err(|error| format!("Agent skill lookup task failed: {error}"))?
}

#[tauri::command]
pub async fn agent_refresh_skills<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<SkillListEntry>, String> {
    agent_list_skills(app_handle).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_a_skills_own_files_for_preview_but_not_its_manifest() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path();
        std::fs::write(
            root.join("SKILL.md"),
            "---
name: x
description: y
---
Body",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("scripts")).unwrap();
        std::fs::write(root.join("scripts").join("run.sh"), "echo hi").unwrap();
        std::fs::write(
            root.join("notes.txt"),
            "a".repeat(PREVIEW_FILE_MAX_BYTES + 10),
        )
        .unwrap();

        let files = collect_skill_files(root).unwrap();

        // Runnable code first: that is what a reviewer is deciding about.
        assert_eq!(
            files
                .iter()
                .map(|file| file.path.as_str())
                .collect::<Vec<_>>(),
            ["scripts/run.sh", "notes.txt"]
        );
        assert_eq!(files[0].content, "echo hi");
        assert!(!files[0].truncated);
        assert!(files[1].truncated);
        assert_eq!(files[1].content.len(), PREVIEW_FILE_MAX_BYTES);
    }

    /// A skill with more files than Preview shows must still show its code.
    /// ui-styling ships 98 files whose names begin with fonts, so in plain
    /// alphabetical order its two Python scripts fell past the cap and a user
    /// approved code the screen never displayed.
    #[test]
    fn preview_shows_runnable_files_even_when_data_files_exceed_the_cap() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path();
        std::fs::write(
            root.join("SKILL.md"),
            "---\nname: x\ndescription: y\n---\nBody",
        )
        .unwrap();
        std::fs::create_dir_all(root.join("canvas-fonts")).unwrap();
        for index in 0..PREVIEW_MAX_FILES + 20 {
            std::fs::write(
                root.join("canvas-fonts").join(format!("Aa{index:03}.ttf")),
                "font",
            )
            .unwrap();
        }
        std::fs::create_dir_all(root.join("scripts")).unwrap();
        std::fs::write(root.join("scripts").join("zz_add.py"), "print('hi')").unwrap();

        let files = collect_skill_files(root).unwrap();

        assert_eq!(files.len(), PREVIEW_MAX_FILES);
        assert_eq!(files[0].path, "scripts/zz_add.py");
        assert_eq!(files[0].content, "print('hi')");
    }

    #[test]
    fn refuses_to_delete_bundled_skills() {
        assert_eq!(
            ensure_skill_can_be_deleted("bundled-skill", true).unwrap_err(),
            "Bundled skill `bundled-skill` cannot be deleted"
        );
        assert!(ensure_skill_can_be_deleted("custom-skill", false).is_ok());
    }

    #[test]
    fn refuses_to_edit_bundled_skills() {
        assert_eq!(
            ensure_skill_can_be_edited("bundled-skill", true).unwrap_err(),
            "Bundled skill `bundled-skill` cannot be edited"
        );
        assert!(ensure_skill_can_be_edited("custom-skill", false).is_ok());
    }

    #[test]
    fn skill_paths_must_stay_inside_the_root_and_end_in_the_name() {
        assert!(is_skill_relative_path("custom-skill", "custom-skill"));
        assert!(is_skill_relative_path(
            "graphics/custom-skill",
            "custom-skill"
        ));
        assert!(!is_skill_relative_path("../custom-skill", "custom-skill"));
        assert!(!is_skill_relative_path(
            "graphics/../custom-skill",
            "custom-skill"
        ));
        assert!(!is_skill_relative_path("/custom-skill", "custom-skill"));
        assert!(!is_skill_relative_path(
            "graphics/other-skill",
            "custom-skill"
        ));
        assert!(!is_skill_relative_path(
            "a/b/c/d/custom-skill",
            "custom-skill"
        ));
        assert!(!is_skill_relative_path("", "custom-skill"));
    }

    fn write_skill(root: &Path, relative: &str) {
        let directory = root.join(relative);
        std::fs::create_dir_all(&directory).unwrap();
        let name = directory.file_name().unwrap().to_string_lossy().to_string();
        std::fs::write(
            directory.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Test\n---\nBody"),
        )
        .unwrap();
    }

    fn load(root: &Path) -> SkillRegistry {
        SkillRegistry::load(
            root,
            &std::collections::BTreeSet::new(),
            &std::collections::BTreeSet::new(),
        )
        .unwrap()
    }

    #[test]
    fn moves_a_skill_into_a_category_and_back_keeping_its_review() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path().join("skills");
        write_skill(&root, "logo-maker");
        let mut registry = load(&root);
        registry.approve("logo-maker").unwrap();

        move_skill(&registry, "logo-maker", "graphics/logos").unwrap();
        let registry = load(&root);
        let record = registry.get("logo-maker").unwrap();
        assert_eq!(record.relative_path, "graphics/logos/logo-maker");
        assert!(record.reviewed, "moving must not ask for review again");

        move_skill(&registry, "logo-maker", "").unwrap();
        let registry = load(&root);
        assert_eq!(
            registry.get("logo-maker").unwrap().relative_path,
            "logo-maker"
        );
        // The category folders it left empty are tidied away.
        assert!(!root.join("graphics").exists());
    }

    #[test]
    fn refuses_to_move_into_a_skill_or_onto_an_existing_folder() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path().join("skills");
        write_skill(&root, "mover");
        write_skill(&root, "host-skill");
        write_skill(&root, "taken/mover-copy");
        std::fs::create_dir_all(root.join("taken/mover")).unwrap();
        let registry = load(&root);

        assert!(move_skill(&registry, "mover", "host-skill")
            .unwrap_err()
            .contains("is a skill"));
        assert!(move_skill(&registry, "mover", "taken")
            .unwrap_err()
            .contains("already exists"));
        assert!(move_skill(&registry, "mover", "../outside").is_err());
        assert!(root.join("mover/SKILL.md").is_file());
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_category_cannot_redirect_a_skill_target() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path().join("skills");
        std::fs::create_dir_all(&root).unwrap();
        write_skill(temp.path(), "outside/victim");
        symlink(temp.path().join("outside"), root.join("linked")).unwrap();
        let canonical_root = std::fs::canonicalize(&root).unwrap();

        assert!(canonical_skill_directory(&canonical_root, "linked/victim", "victim").is_err());
        assert!(temp.path().join("outside/victim/SKILL.md").is_file());
    }
}
