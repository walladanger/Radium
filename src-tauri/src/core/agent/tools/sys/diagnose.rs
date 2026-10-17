//! Diagnose tools: report on the computer, change nothing.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use sysinfo::{Components, Disks, ProcessesToUpdate, System};

use super::{human_bytes, startup};
use crate::core::agent::tools::net::run::{run, CommandSpec, RunError};
use crate::core::agent::tools::net::{bounded, platform::Os, with_raw};
use crate::core::agent::types::{ToolOutcome, ToolStatus};
use tokio_util::sync::CancellationToken;

fn ok(summary: String, details: Value) -> Result<ToolOutcome, ToolOutcome> {
    Ok(ToolOutcome {
        status: ToolStatus::Ok,
        summary: bounded(&summary, 4_400),
        details: Some(details),
    })
}

fn blocking_failed(what: &str) -> ToolOutcome {
    ToolOutcome::error(format!("{what} failed unexpectedly"))
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DiskInfo {
    pub mount: String,
    pub name: String,
    pub file_system: String,
    pub total: u64,
    pub free: u64,
}

pub(crate) fn disks() -> Vec<DiskInfo> {
    let mut seen = Vec::new();
    Disks::new_with_refreshed_list()
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .filter_map(|disk| {
            let mount = disk.mount_point().display().to_string();
            if seen.contains(&mount) {
                return None;
            }
            seen.push(mount.clone());
            Some(DiskInfo {
                mount,
                name: disk.name().to_string_lossy().into_owned(),
                file_system: disk.file_system().to_string_lossy().into_owned(),
                total: disk.total_space(),
                free: disk.available_space(),
            })
        })
        .collect()
}

fn disk_line(disk: &DiskInfo) -> String {
    let used_percent = 100.0 - disk.free as f64 * 100.0 / disk.total.max(1) as f64;
    let warning = if disk.free < disk.total / 10 {
        " — LOW: under 10% free"
    } else {
        ""
    };
    format!(
        "- {} ({}): {} free of {} ({used_percent:.0}% used){warning}",
        disk.mount,
        if disk.file_system.is_empty() {
            "?"
        } else {
            &disk.file_system
        },
        human_bytes(disk.free),
        human_bytes(disk.total),
    )
}

/// OS, uptime, CPU, memory, disks, temperatures and the heaviest processes:
/// the computer-care specialist's starting point, and its reviewer's map.
pub async fn overview() -> Result<ToolOutcome, ToolOutcome> {
    let report = tokio::task::spawn_blocking(|| {
        let mut system = System::new_all();
        system.refresh_cpu_all();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        system.refresh_cpu_all();
        system.refresh_processes(ProcessesToUpdate::All, true);
        let cpus = system.cpus();
        let cpu_usage = cpus.iter().map(|cpu| cpu.cpu_usage()).sum::<f32>() / cpus.len().max(1) as f32;
        let brand = cpus.first().map(|cpu| cpu.brand().trim().to_owned()).unwrap_or_default();
        let uptime = System::uptime();
        let mut processes: Vec<_> = system.processes().values().collect();
        processes.sort_by_key(|process| std::cmp::Reverse(process.memory()));
        let heaviest = processes
            .iter()
            .take(5)
            .map(|process| {
                format!(
                    "{} ({})",
                    process.name().to_string_lossy(),
                    human_bytes(process.memory())
                )
            })
            .collect::<Vec<_>>();
        let temperatures = Components::new_with_refreshed_list()
            .iter()
            .filter_map(|component| {
                component
                    .temperature()
                    .filter(|celsius| celsius.is_finite() && *celsius > 0.0)
                    .map(|celsius| (component.label().to_owned(), celsius))
            })
            .collect::<Vec<_>>();
        let disks = disks();
        let mut map = String::from("# Computer overview\n\n");
        map.push_str(&format!(
            "- OS: {}\n- Computer name: {}\n- Up for: {}\n",
            System::long_os_version().unwrap_or_else(|| "unknown".into()),
            System::host_name().unwrap_or_else(|| "unknown".into()),
            format_uptime(uptime),
        ));
        map.push_str(&format!(
            "- CPU: {brand} — {} cores, {cpu_usage:.0}% busy right now\n",
            cpus.len()
        ));
        map.push_str(&format!(
            "- Memory: {} used of {} ({:.0}%)\n",
            human_bytes(system.used_memory()),
            human_bytes(system.total_memory()),
            system.used_memory() as f64 * 100.0 / system.total_memory().max(1) as f64
        ));
        map.push_str("\n## Disks\n");
        for disk in &disks {
            map.push_str(&disk_line(disk));
            map.push('\n');
        }
        if !temperatures.is_empty() {
            map.push_str("\n## Temperatures\n");
            for (label, celsius) in temperatures.iter().take(8) {
                map.push_str(&format!("- {label}: {celsius:.0} °C{}\n", if *celsius >= 90.0 { " — HOT" } else { "" }));
            }
        }
        map.push_str(&format!("\n## Using the most memory\n- {}\n", heaviest.join("\n- ")));
        map.push_str(
            "\n## Rules\n- Startup item names for fixes must match sys.startup_items exactly.\n\
             - Prefer the smallest fix: clearing temp files before emptying the Recycle Bin; disabling one startup item at a time.\n\
             - Emptying the Recycle Bin is permanent; only with the user's clear agreement.\n",
        );
        let details = json!({
            "cpuUsage": cpu_usage,
            "usedMemory": system.used_memory(),
            "totalMemory": system.total_memory(),
            "uptimeSeconds": uptime,
            "disks": disks,
        });
        (map, details)
    })
    .await
    .map_err(|_| blocking_failed("Reading the computer overview"))?;
    ok(report.0, report.1)
}

fn format_uptime(seconds: u64) -> String {
    let days = seconds / 86_400;
    let hours = seconds % 86_400 / 3_600;
    let minutes = seconds % 3_600 / 60;
    match (days, hours) {
        (0, 0) => format!("{minutes} min"),
        (0, _) => format!("{hours} h {minutes} min"),
        _ => format!("{days} day(s) {hours} h"),
    }
}

pub async fn disk_usage() -> Result<ToolOutcome, ToolOutcome> {
    let disks = tokio::task::spawn_blocking(disks)
        .await
        .map_err(|_| blocking_failed("Reading disks"))?;
    if disks.is_empty() {
        return Err(ToolOutcome::error("No disks could be read"));
    }
    ok(
        format!(
            "Disks:\n{}",
            disks.iter().map(disk_line).collect::<Vec<_>>().join("\n")
        ),
        json!({ "disks": disks }),
    )
}

// --------------------------------------------------------- large items ---

const SCAN_BUDGET: Duration = Duration::from_secs(25);
const SCAN_MAX_ENTRIES: usize = 400_000;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct SizedItem {
    pub path: String,
    pub bytes: u64,
    pub is_dir: bool,
}

#[derive(Debug, Default)]
pub(crate) struct ScanResult {
    pub children: Vec<SizedItem>,
    pub largest_files: Vec<SizedItem>,
    pub complete: bool,
    pub entries: usize,
}

/// Sizes of `root`'s direct children (folders summed recursively) and the
/// largest single files seen, within a time and entry budget. Metadata only;
/// symlinks are never followed.
pub(crate) fn scan(root: &Path, limit: usize, budget: Duration) -> ScanResult {
    let started = Instant::now();
    let mut result = ScanResult {
        complete: true,
        ..ScanResult::default()
    };
    let Ok(entries) = std::fs::read_dir(root) else {
        return result;
    };
    let mut files: Vec<SizedItem> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        let bytes = if metadata.is_dir() {
            let mut total = 0u64;
            let mut stack = vec![path.clone()];
            while let Some(dir) = stack.pop() {
                if started.elapsed() > budget || result.entries > SCAN_MAX_ENTRIES {
                    result.complete = false;
                    break;
                }
                let Ok(items) = std::fs::read_dir(&dir) else {
                    continue;
                };
                for item in items.flatten() {
                    result.entries += 1;
                    let Ok(meta) = std::fs::symlink_metadata(item.path()) else {
                        continue;
                    };
                    if meta.file_type().is_symlink() {
                        continue;
                    }
                    if meta.is_dir() {
                        stack.push(item.path());
                    } else {
                        total += meta.len();
                        files.push(SizedItem {
                            path: item.path().display().to_string(),
                            bytes: meta.len(),
                            is_dir: false,
                        });
                        if files.len() > limit * 8 {
                            files.sort_by_key(|file| std::cmp::Reverse(file.bytes));
                            files.truncate(limit * 2);
                        }
                    }
                }
            }
            total
        } else {
            result.entries += 1;
            files.push(SizedItem {
                path: path.display().to_string(),
                bytes: metadata.len(),
                is_dir: false,
            });
            metadata.len()
        };
        result.children.push(SizedItem {
            path: path.display().to_string(),
            bytes,
            is_dir: metadata.is_dir(),
        });
    }
    result
        .children
        .sort_by_key(|item| std::cmp::Reverse(item.bytes));
    result.children.truncate(limit);
    files.sort_by_key(|file| std::cmp::Reverse(file.bytes));
    files.truncate(limit);
    result.largest_files = files;
    result
}

pub async fn large_items(args: &Value) -> Result<ToolOutcome, ToolOutcome> {
    let root = match args.get("path").and_then(Value::as_str).map(str::trim) {
        Some(path) if !path.is_empty() => {
            crate::core::agent::path_policy::expand_home(path).map_err(ToolOutcome::error)?
        }
        _ => dirs::home_dir().ok_or_else(|| ToolOutcome::error("No home folder found"))?,
    };
    if !root.is_dir() {
        return Err(ToolOutcome::error(format!(
            "{} is not a folder",
            root.display()
        )));
    }
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(15)
        .clamp(1, 30) as usize;
    let scan_root: PathBuf = root.clone();
    let result = tokio::task::spawn_blocking(move || scan(&scan_root, limit, SCAN_BUDGET))
        .await
        .map_err(|_| blocking_failed("Measuring folders"))?;
    let lines = |items: &[SizedItem]| {
        items
            .iter()
            .map(|item| {
                format!(
                    "- {}{}  {}",
                    item.path,
                    if item.is_dir { "\\" } else { "" },
                    human_bytes(item.bytes)
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let mut report = format!(
        "Largest items in {}:\n{}\n\nLargest single files:\n{}",
        root.display(),
        lines(&result.children),
        lines(&result.largest_files)
    );
    if !result.complete {
        report.push_str(&format!(
            "\n\n(Partial: stopped after {}s / {} entries; folder sizes are at least what is shown.)",
            SCAN_BUDGET.as_secs(),
            result.entries
        ));
    }
    ok(
        report,
        json!({ "root": root.display().to_string(), "items": result.children, "largestFiles": result.largest_files, "complete": result.complete }),
    )
}

// ----------------------------------------------------------- processes ---

pub async fn top_processes(args: &Value) -> Result<ToolOutcome, ToolOutcome> {
    let by_cpu = args.get("by").and_then(Value::as_str) == Some("cpu");
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(10)
        .clamp(1, 25) as usize;
    let rows = tokio::task::spawn_blocking(move || {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        if by_cpu {
            std::thread::sleep(
                Duration::from_millis(500).max(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL),
            );
            system.refresh_processes(ProcessesToUpdate::All, true);
        }
        let cores = System::physical_core_count().unwrap_or(1).max(1) as f32;
        let mut processes: Vec<_> = system.processes().values().collect();
        if by_cpu {
            processes.sort_by(|a, b| b.cpu_usage().total_cmp(&a.cpu_usage()));
        } else {
            processes.sort_by_key(|process| std::cmp::Reverse(process.memory()));
        }
        processes
            .into_iter()
            .take(limit)
            .map(|process| {
                json!({
                    "pid": process.pid().as_u32(),
                    "name": process.name().to_string_lossy(),
                    "cpuPercent": process.cpu_usage() / cores,
                    "memory": process.memory(),
                })
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|_| blocking_failed("Listing processes"))?;
    let lines = rows
        .iter()
        .map(|row| {
            format!(
                "- {} (pid {}): {:.1}% CPU, {}",
                row["name"].as_str().unwrap_or("?"),
                row["pid"],
                row["cpuPercent"].as_f64().unwrap_or(0.0),
                human_bytes(row["memory"].as_u64().unwrap_or(0))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    ok(
        format!(
            "Top {} processes by {}:\n{lines}",
            rows.len(),
            if by_cpu { "CPU" } else { "memory" }
        ),
        json!({ "processes": rows }),
    )
}

// ------------------------------------------------------------- startup ---

pub async fn startup_items() -> Result<ToolOutcome, ToolOutcome> {
    let items = tokio::task::spawn_blocking(startup::list)
        .await
        .map_err(|_| blocking_failed("Listing startup items"))?;
    let report = if items.is_empty() {
        "No startup items were found.".to_owned()
    } else {
        let enabled = items.iter().filter(|item| item.enabled).count();
        format!(
            "{} startup item(s), {enabled} enabled:\n{}",
            items.len(),
            items
                .iter()
                .map(|item| format!(
                    "- {} [{}] {}{}",
                    item.name,
                    if item.enabled { "enabled" } else { "disabled" },
                    item.location,
                    if item.machine_wide {
                        " (needs admin to change)"
                    } else {
                        ""
                    }
                ))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    ok(report, json!({ "items": items }))
}

// ------------------------------------------------------ updates/errors ---

fn windows_updates_script() -> &'static str {
    "$ErrorActionPreference='Stop'; \
     $searcher = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher(); \
     $result = $searcher.Search('IsInstalled=0 and IsHidden=0'); \
     $items = @($result.Updates | ForEach-Object { [pscustomobject]@{ title = $_.Title; mandatory = [bool]$_.IsMandatory; reboot = [bool]$_.InstallationBehavior.RebootBehavior } }); \
     ConvertTo-Json -InputObject $items -Compress"
}

pub async fn pending_updates(cancellation: &CancellationToken) -> Result<ToolOutcome, ToolOutcome> {
    let os = Os::current();
    let candidates: Vec<CommandSpec> = match os {
        Os::Windows => vec![CommandSpec::powershell(windows_updates_script())],
        Os::Mac => vec![CommandSpec::new("softwareupdate", &["-l"])],
        Os::Linux => vec![
            CommandSpec::new("apt", &["list", "--upgradable"]),
            CommandSpec::new("dnf", &["check-update", "-q"]),
            CommandSpec::new("checkupdates", &[]),
        ],
        Os::Other => Vec::new(),
    };
    for spec in &candidates {
        match run(spec, Duration::from_secs(180), cancellation).await {
            Err(RunError::NotFound(_)) => continue,
            Err(RunError::Cancelled) => {
                return Err(ToolOutcome {
                    status: ToolStatus::Cancelled,
                    summary: "Update check cancelled".into(),
                    details: None,
                })
            }
            Err(error) => {
                return Err(ToolOutcome::error(format!(
                    "Checking for updates failed: {error}"
                )))
            }
            Ok(output) => {
                let titles: Vec<String> = match os {
                    Os::Windows => serde_json::from_str::<Value>(output.stdout.trim())
                        .ok()
                        .map(|value| match value {
                            Value::Array(items) => items,
                            object @ Value::Object(_) => vec![object],
                            _ => Vec::new(),
                        })
                        .unwrap_or_default()
                        .iter()
                        .filter_map(|item| {
                            item.get("title").and_then(Value::as_str).map(str::to_owned)
                        })
                        .collect(),
                    _ => output
                        .stdout
                        .lines()
                        .map(str::trim)
                        .filter(|line| {
                            !line.is_empty()
                                && !line.starts_with("Listing")
                                && !line.starts_with("Software Update Tool")
                                && !line.starts_with("Finding")
                        })
                        .map(str::to_owned)
                        .collect(),
                };
                let raw = if output.success {
                    String::new()
                } else {
                    output.combined()
                };
                let report = if titles.is_empty() {
                    with_raw("No pending updates found.".into(), &raw)
                } else {
                    format!(
                        "{} pending update(s):\n- {}\n\nInstalling updates is left to the operating system's own update tool.",
                        titles.len(),
                        titles.iter().take(40).cloned().collect::<Vec<_>>().join("\n- ")
                    )
                };
                return ok(report, json!({ "updates": titles }));
            }
        }
    }
    Err(ToolOutcome::error(format!(
        "No update checker is available on {}",
        os.name()
    )))
}

pub async fn recent_errors(
    args: &Value,
    cancellation: &CancellationToken,
) -> Result<ToolOutcome, ToolOutcome> {
    let hours = args
        .get("hours")
        .and_then(Value::as_u64)
        .unwrap_or(24)
        .clamp(1, 168);
    let os = Os::current();
    let spec = match os {
        Os::Windows => CommandSpec::powershell(&format!(
            "$ErrorActionPreference='SilentlyContinue'; \
             $items = @(Get-WinEvent -FilterHashtable @{{LogName='System','Application'; Level=1,2; StartTime=(Get-Date).AddHours(-{hours})}} -MaxEvents 40 | \
               ForEach-Object {{ [pscustomobject]@{{ time = $_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); source = $_.ProviderName; id = $_.Id; level = $_.LevelDisplayName; message = (($_.Message -split \"`n\")[0]).Trim() }} }}); \
             ConvertTo-Json -InputObject $items -Compress"
        )),
        Os::Linux => CommandSpec::new(
            "journalctl",
            &["-p", "3", "--since", &format!("-{hours}h"), "-o", "short", "--no-pager", "-n", "40"],
        ),
        Os::Mac => CommandSpec::new(
            "log",
            &["show", "--last", &format!("{}h", hours.min(2)), "--predicate", "messageType == fault", "--style", "compact"],
        ),
        Os::Other => return Err(ToolOutcome::error("Reading system errors is not available here")),
    };
    let output = run(&spec, Duration::from_secs(90), cancellation)
        .await
        .map_err(|error| ToolOutcome::error(format!("Reading system errors failed: {error}")))?;
    let report = match os {
        Os::Windows => {
            let events = serde_json::from_str::<Value>(output.stdout.trim())
                .ok()
                .map(|value| match value {
                    Value::Array(items) => items,
                    object @ Value::Object(_) => vec![object],
                    _ => Vec::new(),
                })
                .unwrap_or_default();
            if events.is_empty() {
                format!("No critical or error events in the last {hours} hour(s).")
            } else {
                format!(
                    "{} error event(s) in the last {hours} hour(s), newest first:\n{}",
                    events.len(),
                    events
                        .iter()
                        .map(|event| format!(
                            "- {} {} (id {}): {}",
                            event["time"].as_str().unwrap_or(""),
                            event["source"].as_str().unwrap_or(""),
                            event["id"],
                            event["message"].as_str().unwrap_or("")
                        ))
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            }
        }
        _ => {
            let lines: Vec<&str> = output
                .stdout
                .lines()
                .filter(|line| !line.trim().is_empty())
                .collect();
            if lines.is_empty() {
                format!("No errors logged in the last {hours} hour(s).")
            } else {
                format!(
                    "Errors logged in the last {hours} hour(s):\n{}",
                    lines
                        .iter()
                        .rev()
                        .take(40)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n")
                )
            }
        }
    };
    ok(report, json!({ "hours": hours }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uptime_reads_naturally() {
        assert_eq!(format_uptime(59 * 60), "59 min");
        assert_eq!(format_uptime(3 * 3_600 + 5 * 60), "3 h 5 min");
        assert_eq!(format_uptime(2 * 86_400 + 4 * 3_600), "2 day(s) 4 h");
    }

    #[test]
    fn the_scan_sums_folders_skips_nothing_and_reports_the_biggest_file() {
        let temp = tempfile::TempDir::new().unwrap();
        let root = temp.path();
        std::fs::create_dir_all(root.join("videos/2026")).unwrap();
        std::fs::write(root.join("videos/2026/a.bin"), vec![0u8; 50_000]).unwrap();
        std::fs::write(root.join("videos/b.bin"), vec![0u8; 20_000]).unwrap();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("docs/c.txt"), vec![0u8; 1_000]).unwrap();
        std::fs::write(root.join("loose.bin"), vec![0u8; 5_000]).unwrap();

        let result = scan(root, 10, Duration::from_secs(10));
        assert!(result.complete);
        assert!(result.children[0].path.ends_with("videos"));
        assert_eq!(result.children[0].bytes, 70_000);
        assert!(result.children[0].is_dir);
        assert_eq!(result.children.len(), 3);
        assert!(result.largest_files[0].path.ends_with("a.bin"));
        assert_eq!(result.largest_files[0].bytes, 50_000);
    }

    #[test]
    fn a_zero_budget_scan_says_it_is_partial() {
        let temp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(temp.path().join("deep/er")).unwrap();
        std::fs::write(temp.path().join("deep/er/x"), b"x").unwrap();
        let result = scan(temp.path(), 5, Duration::ZERO);
        assert!(!result.complete);
    }
}
