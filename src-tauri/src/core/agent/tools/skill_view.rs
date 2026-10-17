use serde_json::Value;

use super::{required_string, ToolContext};
use crate::core::agent::types::ToolOutcome;

pub async fn execute(args: &Value, context: &ToolContext<'_>) -> Result<ToolOutcome, ToolOutcome> {
    let name = required_string(args, "name").map_err(ToolOutcome::error)?;
    let offset = match args.get("offset") {
        None => 0,
        Some(value) => value
            .as_u64()
            .and_then(|value| usize::try_from(value).ok())
            .ok_or_else(|| ToolOutcome::error("offset must be a nonnegative integer"))?,
    };
    Ok(context
        .loaded_skills
        .view_page(&name, context.skill_registry, offset)
        .await)
}
