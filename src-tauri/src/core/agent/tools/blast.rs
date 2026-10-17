//! What a system-changing agent action will do — shown on its approval card
//! before the user decides, and given to the reviewer for a second opinion.

use serde::Serialize;
use serde_json::Value;

/// What a fix will do to the computer, shown on the approval card before the
/// user decides and repeated in the result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlastRadius {
    /// One plain sentence: what will happen.
    pub action: String,
    /// What changes on the computer.
    pub changes: String,
    /// What stops working, and for how long.
    pub disruption: String,
    /// Who else is affected (other apps, other adapters, other users).
    pub affects: String,
    /// How to put it back.
    pub undo: String,
    pub needs_admin: bool,
    pub needs_reboot: bool,
    /// "low", "medium" or "high".
    pub risk: &'static str,
}

impl BlastRadius {
    pub fn to_markdown(&self) -> String {
        format!(
            "Action: {}\n- Changes: {}\n- Disruption: {}\n- Affects: {}\n- Undo: {}\n- Admin rights: {}\n- Reboot needed: {}\n- Risk: {}",
            self.action,
            self.changes,
            self.disruption,
            self.affects,
            self.undo,
            if self.needs_admin { "yes" } else { "no" },
            if self.needs_reboot { "yes" } else { "no" },
            self.risk,
        )
    }
}

/// The blast radius of any tool call that has one (network and computer
/// fixes); `None` for everything else.
pub fn for_call(tool: &str, args: &Value) -> Option<BlastRadius> {
    super::net::blast_radius(tool, args).or_else(|| super::sys::blast_radius(tool, args))
}
