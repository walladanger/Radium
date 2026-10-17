//! Fix tools: free space or change what starts with the computer. Each is
//! approval-gated and re-reads its target from the live system first.

use std::path::Path;
use std::time::{Duration, SystemTime};

use serde_json::{json, Value};

use super::startup::{self, SetResult};
use super::{blast_radius, human_bytes, older_than_days};
use crate::core::agent::tools::net::platform::Os;
use crate::core::agent::tools::net::run::{elevation_declined, run, windows_elevated, CommandSpec};
use crate::core::agent::tools::ToolContext;
use crate::core::agent::types::{ToolOutcome, ToolStatus};

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct CleanReport {
    pub deleted_files: usize,
    pub freed_bytes: u64,
    pub skipped: usize,
}

/// Delete files under `root` last modified more than `older_than` ago.
/// Never follows symlinks, never leaves `root`, removes folders only when
/// they end up empty, and skips anything locked or unreadable.
pub(crate) fn clean_old_files(root: &Path, older_than: Duration, now: SystemTime) -> CleanReport {
    let mut report = CleanReport::default();
    clean_dir(root, older_than, now, &mut report, 0);
    report
}

fn clean_dir(
    dir: &Path,
    older_than: Duration,
    now: SystemTime,
    report: &mut CleanReport,
    depth: usize,
) {
    if depth > 32 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        report.skipped += 1;
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            report.skipped += 1;
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            clean_dir(&path, older_than, now, report, depth + 1);
            // Only an emptied folder goes; a non-empty one fails harmlessly.
            let _ = std::fs::remove_dir(&path);
            continue;
        }
        let old_enough = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age >= older_than);
        if !old_enough {
            continue;
        }
        match std::fs::remove_file(&path) {
            Ok(()) => {
                report.deleted_files += 1;
                report.freed_bytes += metadata.len();
            }
            Err(_) => report.skipped += 1,
        }
    }
}

pub async fn clean_temp(
    args: &Value,
    _context: &ToolContext<'_>,
) -> Result<ToolOutcome, ToolOutcome> {
    let days = older_than_days(args);
    let root = std::env::temp_dir();
    let scan_root = root.clone();
    let report = tokio::task::spawn_blocking(move || {
        clean_old_files(
            &scan_root,
            Duration::from_secs(days * 86_400),
            SystemTime::now(),
        )
    })
    .await
    .map_err(|_| ToolOutcome::error("Cleaning temporary files failed unexpectedly"))?;
    Ok(ToolOutcome {
        status: ToolStatus::Ok,
        summary: format!(
            "Freed {} by deleting {} temporary file(s) older than {days} day(s) from {}. {} item(s) were in use or unreadable and were left alone.",
            human_bytes(report.freed_bytes),
            report.deleted_files,
            root.display(),
            report.skipped
        ),
        details: Some(json!({
            "blastRadius": blast_radius("sys.clean_temp", args),
            "freedBytes": report.freed_bytes,
            "deletedFiles": report.deleted_files,
            "skipped": report.skipped,
        })),
    })
}

pub async fn empty_recycle_bin(context: &ToolContext<'_>) -> Result<ToolOutcome, ToolOutcome> {
    let spec = match Os::current() {
        Os::Windows => CommandSpec::powershell(
            "$ErrorActionPreference='Stop'; Clear-RecycleBin -Force; 'Recycle Bin emptied.'",
        ),
        Os::Mac => CommandSpec::new(
            "osascript",
            &["-e", "tell application \"Finder\" to empty trash"],
        ),
        Os::Linux => CommandSpec::new("gio", &["trash", "--empty"]),
        Os::Other => {
            return Err(ToolOutcome::error(
                "Emptying the trash is not available here",
            ))
        }
    };
    let output = run(&spec, Duration::from_secs(300), context.cancellation)
        .await
        .map_err(|error| ToolOutcome::error(format!("Emptying the Recycle Bin failed: {error}")))?;
    // Windows reports an already-empty bin as an error; that is success here.
    let already_empty = output
        .combined()
        .to_lowercase()
        .contains("cannot find the path")
        || output.combined().to_lowercase().contains("is empty");
    if output.success || already_empty {
        Ok(ToolOutcome {
            status: ToolStatus::Ok,
            summary: if already_empty {
                "The Recycle Bin was already empty.".into()
            } else {
                "The Recycle Bin / Trash was emptied. Those files are permanently deleted.".into()
            },
            details: Some(
                json!({ "blastRadius": blast_radius("sys.empty_recycle_bin", &json!({})) }),
            ),
        })
    } else {
        Err(ToolOutcome::error(format!(
            "Emptying the Recycle Bin failed: {}",
            output.combined()
        )))
    }
}

pub async fn set_startup_item(
    args: &Value,
    enabled: bool,
    context: &ToolContext<'_>,
) -> Result<ToolOutcome, ToolOutcome> {
    let tool = if enabled {
        "sys.enable_startup_item"
    } else {
        "sys.disable_startup_item"
    };
    let name = args
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| ToolOutcome::error("`name` is required (see sys.startup_items)"))?
        .to_owned();
    let items = tokio::task::spawn_blocking(startup::list)
        .await
        .map_err(|_| ToolOutcome::error("Listing startup items failed unexpectedly"))?;
    let item = startup::find(&items, &name)
        .map_err(ToolOutcome::error)?
        .clone();
    if item.enabled == enabled {
        return Ok(ToolOutcome::ok(format!(
            "\"{}\" is already {}; nothing changed.",
            item.name,
            if enabled { "enabled" } else { "disabled" }
        )));
    }
    let change_item = item.clone();
    let result = tokio::task::spawn_blocking(move || startup::set_enabled(&change_item, enabled))
        .await
        .map_err(|_| ToolOutcome::error("Changing the startup item failed unexpectedly"))?
        .map_err(ToolOutcome::error)?;
    let elevated = match result {
        SetResult::Done => false,
        SetResult::Unsupported(message) => return Err(ToolOutcome::error(message)),
        SetResult::NeedsElevation(script) => {
            let output_file =
                std::env::temp_dir().join(format!("radium-sys-{}.txt", uuid::Uuid::new_v4()));
            let spec = windows_elevated(&script, &output_file.display().to_string());
            let output = run(&spec, Duration::from_secs(120), context.cancellation)
                .await
                .map_err(|error| {
                    ToolOutcome::error(format!("The change could not run: {error}"))
                })?;
            if elevation_declined(&output) {
                return Err(ToolOutcome::denied(
                    "This startup item belongs to all users and needs administrator rights; the admin prompt was declined. Nothing was changed.",
                    "elevation-declined",
                ));
            }
            if !output.success {
                return Err(ToolOutcome::error(format!(
                    "The change failed: {}",
                    output.combined()
                )));
            }
            true
        }
    };
    // Read it back so the result reports what is true, not what was intended.
    let after = tokio::task::spawn_blocking(startup::list)
        .await
        .ok()
        .and_then(|items| {
            startup::find(&items, &item.name)
                .ok()
                .map(|found| found.enabled)
        });
    let confirmed = after == Some(enabled);
    Ok(ToolOutcome {
        status: if confirmed {
            ToolStatus::Ok
        } else {
            ToolStatus::Error
        },
        summary: format!(
            "\"{}\" {}{}. Undo: {}",
            item.name,
            if confirmed {
                if enabled {
                    "will start automatically again"
                } else {
                    "will no longer start automatically"
                }
            } else {
                "may not have changed — reading it back did not confirm the new state"
            },
            if elevated {
                " (with administrator rights)"
            } else {
                ""
            },
            blast_radius(tool, args)
                .map(|radius| radius.undo)
                .unwrap_or_default()
        ),
        details: Some(
            json!({ "blastRadius": blast_radius(tool, args), "item": item.name, "enabled": after }),
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_age(path: &Path, age: Duration) {
        let file = std::fs::File::options().write(true).open(path).unwrap();
        file.set_modified(SystemTime::now() - age).unwrap();
    }

    #[test]
    fn only_old_files_go_and_folders_survive_unless_emptied() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path();
        std::fs::create_dir_all(root.join("old-cache")).unwrap();
        std::fs::create_dir_all(root.join("mixed")).unwrap();
        std::fs::write(root.join("old.tmp"), vec![0u8; 1_000]).unwrap();
        std::fs::write(root.join("fresh.tmp"), vec![0u8; 500]).unwrap();
        std::fs::write(root.join("old-cache/a"), vec![0u8; 2_000]).unwrap();
        std::fs::write(root.join("mixed/old"), vec![0u8; 300]).unwrap();
        std::fs::write(root.join("mixed/new"), vec![0u8; 300]).unwrap();
        let week = Duration::from_secs(7 * 86_400);
        set_age(&root.join("old.tmp"), week);
        set_age(&root.join("old-cache/a"), week);
        set_age(&root.join("mixed/old"), week);

        let report = clean_old_files(root, Duration::from_secs(2 * 86_400), SystemTime::now());

        assert_eq!(report.deleted_files, 3);
        assert_eq!(report.freed_bytes, 3_300);
        assert!(!root.join("old.tmp").exists());
        assert!(root.join("fresh.tmp").exists());
        assert!(
            !root.join("old-cache").exists(),
            "an emptied folder is removed"
        );
        assert!(root.join("mixed/new").exists());
        assert!(root.exists(), "the root itself is never removed");
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_out_of_the_temp_folder_are_never_followed() {
        let outside = tempfile::TempDir::new().unwrap();
        std::fs::write(outside.path().join("precious"), b"keep").unwrap();
        set_age(
            &outside.path().join("precious"),
            Duration::from_secs(30 * 86_400),
        );
        let temp = tempfile::TempDir::new().unwrap();
        std::os::unix::fs::symlink(outside.path(), temp.path().join("link")).unwrap();

        clean_old_files(temp.path(), Duration::from_secs(86_400), SystemTime::now());

        assert!(outside.path().join("precious").exists());
    }
}
