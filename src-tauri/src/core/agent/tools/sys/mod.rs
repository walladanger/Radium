//! `sys.*`: the computer-care specialist's tools (the `computer` tool pack).
//!
//! Diagnose tools (`PureRead`) report on the machine and change nothing. Fix
//! tools (`ApprovalGated`) free space or change what starts with the
//! computer; each shows its [`BlastRadius`] and a reviewer's second opinion
//! before the user decides, works only on targets it re-reads from the live
//! system, and reports what it did.

mod diagnose;
mod fix;
#[cfg(test)]
mod live_tests;
pub(crate) mod startup;

use serde_json::Value;

use super::blast::BlastRadius;
use super::ToolContext;
use crate::core::agent::types::ToolOutcome;

/// The tool pack that turns these tools on.
pub const COMPUTER_PACK: &str = "computer";

pub const SYS_DIAGNOSE_TOOLS: [&str; 7] = [
    "sys.overview",
    "sys.disk_usage",
    "sys.large_items",
    "sys.top_processes",
    "sys.startup_items",
    "sys.pending_updates",
    "sys.recent_errors",
];

pub const SYS_FIX_TOOLS: [&str; 4] = [
    "sys.clean_temp",
    "sys.empty_recycle_bin",
    "sys.disable_startup_item",
    "sys.enable_startup_item",
];

pub fn sys_tool_names() -> impl Iterator<Item = &'static str> {
    SYS_DIAGNOSE_TOOLS.into_iter().chain(SYS_FIX_TOOLS)
}

pub async fn execute(
    tool: &str,
    args: &Value,
    context: &ToolContext<'_>,
) -> Result<ToolOutcome, ToolOutcome> {
    match tool {
        "sys.overview" => diagnose::overview().await,
        "sys.disk_usage" => diagnose::disk_usage().await,
        "sys.large_items" => diagnose::large_items(args).await,
        "sys.top_processes" => diagnose::top_processes(args).await,
        "sys.startup_items" => diagnose::startup_items().await,
        "sys.pending_updates" => diagnose::pending_updates(context.cancellation).await,
        "sys.recent_errors" => diagnose::recent_errors(args, context.cancellation).await,
        "sys.clean_temp" => fix::clean_temp(args, context).await,
        "sys.empty_recycle_bin" => fix::empty_recycle_bin(context).await,
        "sys.disable_startup_item" => fix::set_startup_item(args, false, context).await,
        "sys.enable_startup_item" => fix::set_startup_item(args, true, context).await,
        _ => Err(ToolOutcome::error(format!("Unknown computer tool: {tool}"))),
    }
}

/// The computer overview as Markdown, for the reviewer.
pub(crate) async fn overview_text() -> String {
    match diagnose::overview().await {
        Ok(outcome) | Err(outcome) => outcome.summary,
    }
}

/// Days of age before a temp file may be cleaned (default 2, 1-365).
pub fn older_than_days(args: &Value) -> u64 {
    args.get("olderThanDays")
        .and_then(Value::as_u64)
        .unwrap_or(2)
        .clamp(1, 365)
}

fn name_arg(args: &Value) -> String {
    args.get("name")
        .and_then(Value::as_str)
        .unwrap_or("the item")
        .trim()
        .to_owned()
}

/// The blast radius of a `sys.*` fix call; `None` for diagnose tools.
pub fn blast_radius(tool: &str, args: &Value) -> Option<BlastRadius> {
    Some(match tool {
        "sys.clean_temp" => {
            let days = older_than_days(args);
            BlastRadius {
                action: format!(
                    "Delete files older than {days} day(s) from your user temporary folder."
                ),
                changes: "Frees disk space. Files in use and anything newer are skipped.".into(),
                disruption: "None expected. A program that kept old work in its temp files (rare) loses it.".into(),
                affects: "Only your own temporary folder; system folders and other users are untouched.".into(),
                undo: "Deleted temp files cannot be restored.".into(),
                needs_admin: false,
                needs_reboot: false,
                risk: "low",
            }
        }
        "sys.empty_recycle_bin" => BlastRadius {
            action: "Permanently delete everything in the Recycle Bin / Trash.".into(),
            changes: "Frees the space the deleted files still use.".into(),
            disruption: "None, unless you still needed something in there.".into(),
            affects: "Every file currently in the Recycle Bin / Trash on this computer.".into(),
            undo: "Cannot be undone: the files are gone for good. Check the Recycle Bin first if unsure.".into(),
            needs_admin: false,
            needs_reboot: false,
            risk: "high",
        },
        "sys.disable_startup_item" => {
            let name = name_arg(args);
            BlastRadius {
                action: format!("Stop \"{name}\" from starting automatically when you sign in."),
                changes: "Marks it disabled, like Task Manager's Startup tab; the program itself is not removed.".into(),
                disruption: "None now — a copy already running keeps running. From the next sign-in it no longer starts by itself.".into(),
                affects: "Only that program. Anything that relies on it running in the background (sync, tray tools) waits until you open it.".into(),
                undo: format!("Run sys.enable_startup_item with name \"{name}\"."),
                needs_admin: false,
                needs_reboot: false,
                risk: "low",
            }
        }
        "sys.enable_startup_item" => {
            let name = name_arg(args);
            BlastRadius {
                action: format!("Let \"{name}\" start automatically again when you sign in."),
                changes: "Marks it enabled again.".into(),
                disruption: "None now; it starts from the next sign-in.".into(),
                affects: "Only that program.".into(),
                undo: format!("Run sys.disable_startup_item with name \"{name}\"."),
                needs_admin: false,
                needs_reboot: false,
                risk: "low",
            }
        }
        _ => return None,
    })
}

/// Human-readable byte count.
pub(crate) fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_fix_has_a_blast_radius_and_no_diagnosis_does() {
        for tool in SYS_FIX_TOOLS {
            let radius = blast_radius(tool, &json!({"name": "Example"}))
                .unwrap_or_else(|| panic!("{tool} lacks a blast radius"));
            assert!(!radius.action.is_empty() && !radius.undo.is_empty());
        }
        for tool in SYS_DIAGNOSE_TOOLS {
            assert!(blast_radius(tool, &json!({})).is_none(), "{tool}");
        }
    }

    #[test]
    fn emptying_the_recycle_bin_is_high_risk_and_says_it_is_permanent() {
        let radius = blast_radius("sys.empty_recycle_bin", &json!({})).unwrap();
        assert_eq!(radius.risk, "high");
        assert!(radius.undo.contains("Cannot be undone"));
    }

    #[test]
    fn startup_changes_name_the_item_and_their_undo() {
        let radius = blast_radius("sys.disable_startup_item", &json!({"name": "Spotify"})).unwrap();
        assert!(radius.action.contains("\"Spotify\""));
        assert!(radius.undo.contains("sys.enable_startup_item"));
    }

    #[test]
    fn temp_age_is_bounded() {
        assert_eq!(older_than_days(&json!({})), 2);
        assert_eq!(older_than_days(&json!({"olderThanDays": 0})), 1);
        assert_eq!(older_than_days(&json!({"olderThanDays": 9999})), 365);
        let radius = blast_radius("sys.clean_temp", &json!({"olderThanDays": 7})).unwrap();
        assert!(radius.action.contains("7 day(s)"));
    }

    #[test]
    fn bytes_read_naturally() {
        assert_eq!(human_bytes(512), "512 B");
        assert_eq!(human_bytes(1536), "1.5 KB");
        assert_eq!(human_bytes(5 * 1024 * 1024 * 1024), "5.0 GB");
    }
}
