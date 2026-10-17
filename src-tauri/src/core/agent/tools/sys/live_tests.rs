//! Live checks against the real machine. Ignored by default (they depend on
//! the host); run with
//! `cargo test ... core::agent::tools::sys::live_tests -- --ignored --nocapture`.
//! Diagnose tools only: nothing here changes the computer.

use serde_json::json;
use tokio_util::sync::CancellationToken;

use super::diagnose;
use crate::core::agent::types::{ToolOutcome, ToolStatus};

fn report(name: &str, result: Result<ToolOutcome, ToolOutcome>) -> ToolOutcome {
    let outcome = match result {
        Ok(outcome) | Err(outcome) => outcome,
    };
    println!("== {name} [{:?}]\n{}\n", outcome.status, outcome.summary);
    outcome
}

#[tokio::test]
#[ignore = "reads the host computer"]
async fn live_overview_and_disks_report_on_this_machine() {
    let overview = report("sys.overview", diagnose::overview().await);
    assert_eq!(overview.status, ToolStatus::Ok);
    assert!(!overview.summary.is_empty());
    let disks = report("sys.disk_usage", diagnose::disk_usage().await);
    assert_eq!(disks.status, ToolStatus::Ok);
}

#[tokio::test]
#[ignore = "reads the host computer"]
async fn live_processes_and_startup_items_report_on_this_machine() {
    let processes = report(
        "sys.top_processes",
        diagnose::top_processes(&json!({"limit": 5})).await,
    );
    assert_eq!(processes.status, ToolStatus::Ok);
    let startup = report("sys.startup_items", diagnose::startup_items().await);
    assert_eq!(startup.status, ToolStatus::Ok);
}

#[tokio::test]
#[ignore = "reads the host computer"]
async fn live_large_items_scans_the_home_folder() {
    let outcome = report(
        "sys.large_items",
        diagnose::large_items(&json!({"limit": 5})).await,
    );
    assert_eq!(outcome.status, ToolStatus::Ok);
}

#[tokio::test]
#[ignore = "reads the host computer"]
async fn live_updates_and_errors_report_on_this_machine() {
    let cancellation = CancellationToken::new();
    // The update searcher can be unavailable (service off, policy); either
    // way the tool must answer rather than hang or panic.
    report(
        "sys.pending_updates",
        diagnose::pending_updates(&cancellation).await,
    );
    let errors = report(
        "sys.recent_errors",
        diagnose::recent_errors(&json!({"hours": 24}), &cancellation).await,
    );
    assert_eq!(errors.status, ToolStatus::Ok);
}
