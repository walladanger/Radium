//! Approved Recycle Bin and startup changes. Automatic temporary-file cleanup
//! remains unavailable until its scope and race safety can be guaranteed.

use std::time::Duration;

use serde_json::{json, Value};

use super::blast_radius;
use super::startup::{self, SetResult};
use crate::core::agent::tools::net::platform::Os;
use crate::core::agent::tools::net::run::{elevation_declined, run, windows_elevated, CommandSpec};
use crate::core::agent::tools::ToolContext;
use crate::core::agent::types::{ToolOutcome, ToolStatus};

/// General temporary folders may be shared or redirected, and selective
/// pathname traversal cannot guarantee that concurrent link swaps stay inside
/// the approved folder. Keep this tool unavailable until Radium owns a safe
/// cleanup store; never fall back to deleting the system temporary folder.
pub async fn clean_temp(_args: &Value) -> Result<ToolOutcome, ToolOutcome> {
    Err(ToolOutcome::error(
        "Automatic temporary-file cleanup is unavailable because Radium cannot safely verify its scope. Nothing was deleted. Use your operating system's Storage settings to review and remove temporary files.",
    ))
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

    #[tokio::test]
    async fn cleanup_refuses_to_delete_even_when_a_folder_is_supplied() {
        let temp = tempfile::TempDir::new().unwrap();
        let retained = temp.path().join("work-in-progress.tmp");
        std::fs::write(&retained, b"keep").unwrap();

        let outcome = clean_temp(&json!({
            "path": temp.path(),
            "olderThanDays": 0
        }))
        .await
        .unwrap_err();

        assert_eq!(outcome.status, ToolStatus::Error);
        assert!(outcome.summary.contains("Nothing was deleted"));
        assert!(outcome.summary.contains("Storage settings"));
        assert_eq!(std::fs::read(&retained).unwrap(), b"keep");
    }
}
