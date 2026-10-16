//! Programs that start with the computer, and switching them off or on.
//!
//! Windows uses the same mechanism as Task Manager's Startup tab: entries in
//! the `Run` keys and Startup folders, enabled or disabled by a flag under
//! `Explorer\StartupApproved` — the program and its entry are never removed,
//! so a change is undone by flipping the flag back. Linux uses per-user
//! `.desktop` overrides with `Hidden=`. macOS is listed but not changed.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    /// What the user sees and passes to the fix tools.
    pub name: String,
    pub command: String,
    pub location: String,
    pub enabled: bool,
    /// Machine-wide entries need administrator rights to change.
    pub machine_wide: bool,
    /// Platform handle used to change it (registry value / file name / path).
    #[serde(skip)]
    pub handle: Handle,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Handle {
    /// `StartupApproved` key path (under HKCU or HKLM) and value name.
    WindowsApproved {
        hive_machine: bool,
        subkey: String,
        value: String,
    },
    /// A `.desktop` file name and the directory it was found in.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    LinuxDesktop {
        file: String,
        source: std::path::PathBuf,
    },
    #[default]
    ReadOnly,
}

/// Find a startup item by the name the model passed: exact, then
/// case-insensitive. An unknown name lists what exists.
pub fn find<'a>(items: &'a [StartupItem], name: &str) -> Result<&'a StartupItem, String> {
    let name = name.trim();
    items
        .iter()
        .find(|item| item.name == name)
        .or_else(|| {
            items
                .iter()
                .find(|item| item.name.eq_ignore_ascii_case(name))
        })
        .ok_or_else(|| {
            format!(
                "No startup item is named '{name}'. Startup items: {}",
                if items.is_empty() {
                    "none found".to_owned()
                } else {
                    items
                        .iter()
                        .map(|item| item.name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                }
            )
        })
}

/// The `StartupApproved` flag: the first byte's low bit set means disabled.
pub fn approved_flag_enabled(data: &[u8]) -> bool {
    data.first().is_none_or(|flag| flag & 1 == 0)
}

/// The 12-byte flag Windows writes: 0x02 enabled / 0x03 disabled, then zeros.
pub fn approved_flag(enabled: bool) -> Vec<u8> {
    let mut data = vec![0u8; 12];
    data[0] = if enabled { 0x02 } else { 0x03 };
    data
}

/// A parsed `.desktop` autostart entry: (Name, Exec, enabled).
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub fn parse_desktop_entry(text: &str) -> Option<(String, String, bool)> {
    let mut in_entry = false;
    let (mut name, mut exec, mut enabled) = (None, String::new(), true);
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        match key.trim() {
            "Name" => name = Some(value.trim().to_owned()),
            "Exec" => exec = value.trim().to_owned(),
            "Hidden" if value.trim().eq_ignore_ascii_case("true") => enabled = false,
            "X-GNOME-Autostart-enabled" if value.trim().eq_ignore_ascii_case("false") => {
                enabled = false
            }
            _ => {}
        }
    }
    Some((name?, exec, enabled))
}

/// A `.desktop` file with `Hidden=` set to hide (disable) or show it.
pub fn desktop_with_hidden(text: &str, hidden: bool) -> String {
    let mut out = Vec::new();
    let mut in_entry = false;
    let mut written = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            if in_entry && !written {
                out.push(format!("Hidden={hidden}"));
                written = true;
            }
            in_entry = trimmed == "[Desktop Entry]";
            out.push(line.to_owned());
            continue;
        }
        if in_entry && trimmed.starts_with("Hidden=") {
            if !written {
                out.push(format!("Hidden={hidden}"));
                written = true;
            }
            continue;
        }
        out.push(line.to_owned());
    }
    if !written {
        if !in_entry {
            out.push("[Desktop Entry]".into());
        }
        out.push(format!("Hidden={hidden}"));
    }
    let mut joined = out.join("\n");
    joined.push('\n');
    joined
}

// ---------------------------------------------------------------- list ---

#[cfg(windows)]
pub fn list() -> Vec<StartupItem> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";
    let mut items = Vec::new();
    let approved_enabled = |machine: bool, sub: &str, value: &str| -> bool {
        let hive = RegKey::predef(if machine {
            HKEY_LOCAL_MACHINE
        } else {
            HKEY_CURRENT_USER
        });
        hive.open_subkey(format!(r"{APPROVED}\{sub}"))
            .and_then(|key| key.get_raw_value(value))
            .map(|raw| approved_flag_enabled(&raw.bytes))
            .unwrap_or(true)
    };
    let run_keys: [(bool, &str, &str, &str); 3] = [
        (
            false,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            "Run",
            "Registry (you)",
        ),
        (
            true,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            "Run",
            "Registry (all users)",
        ),
        (
            true,
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",
            "Run32",
            "Registry (all users, 32-bit)",
        ),
    ];
    for (machine, path, approved_sub, location) in run_keys {
        let hive = RegKey::predef(if machine {
            HKEY_LOCAL_MACHINE
        } else {
            HKEY_CURRENT_USER
        });
        let Ok(key) = hive.open_subkey(path) else {
            continue;
        };
        for (value, data) in key.enum_values().flatten() {
            items.push(StartupItem {
                enabled: approved_enabled(machine, approved_sub, &value),
                command: data.to_string(),
                location: location.into(),
                machine_wide: machine,
                handle: Handle::WindowsApproved {
                    hive_machine: machine,
                    subkey: format!(r"{APPROVED}\{approved_sub}"),
                    value: value.clone(),
                },
                name: value,
            });
        }
    }
    let folders = [
        (
            false,
            std::env::var("APPDATA")
                .ok()
                .map(|d| format!(r"{d}\Microsoft\Windows\Start Menu\Programs\Startup")),
            "Startup folder (you)",
        ),
        (
            true,
            std::env::var("PROGRAMDATA")
                .ok()
                .map(|d| format!(r"{d}\Microsoft\Windows\Start Menu\Programs\StartUp")),
            "Startup folder (all users)",
        ),
    ];
    for (machine, folder, location) in folders {
        let Some(folder) = folder else { continue };
        let Ok(entries) = std::fs::read_dir(&folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if file.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }
            let name = file.strip_suffix(".lnk").unwrap_or(&file).to_owned();
            items.push(StartupItem {
                enabled: approved_enabled(machine, "StartupFolder", &file),
                command: entry.path().display().to_string(),
                location: location.into(),
                machine_wide: machine,
                handle: Handle::WindowsApproved {
                    hive_machine: machine,
                    subkey: format!(r"{APPROVED}\StartupFolder"),
                    value: file,
                },
                name,
            });
        }
    }
    items
}

#[cfg(target_os = "linux")]
pub fn list() -> Vec<StartupItem> {
    let user_dir = dirs::config_dir().map(|dir| dir.join("autostart"));
    let mut by_file: std::collections::BTreeMap<String, StartupItem> = Default::default();
    // System entries first; a user override with the same file name wins.
    let sources = [(std::path::PathBuf::from("/etc/xdg/autostart"), true)]
        .into_iter()
        .chain(user_dir.map(|dir| (dir, false)));
    for (dir, machine) in sources {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            if !file.ends_with(".desktop") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else {
                continue;
            };
            let Some((name, exec, enabled)) = parse_desktop_entry(&text) else {
                continue;
            };
            by_file.insert(
                file.clone(),
                StartupItem {
                    name,
                    command: exec,
                    location: if machine {
                        "System autostart".into()
                    } else {
                        "Your autostart".into()
                    },
                    enabled,
                    machine_wide: false,
                    handle: Handle::LinuxDesktop {
                        file,
                        source: dir.clone(),
                    },
                },
            );
        }
    }
    by_file.into_values().collect()
}

#[cfg(target_os = "macos")]
pub fn list() -> Vec<StartupItem> {
    let home = std::env::var("HOME").unwrap_or_default();
    let dirs = [
        (
            format!("{home}/Library/LaunchAgents"),
            "Launch agent (you)",
            false,
        ),
        (
            "/Library/LaunchAgents".to_owned(),
            "Launch agent (all users)",
            true,
        ),
        (
            "/Library/LaunchDaemons".to_owned(),
            "Launch daemon (system)",
            true,
        ),
    ];
    let mut items = Vec::new();
    for (dir, location, machine) in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let file = entry.file_name().to_string_lossy().into_owned();
            let Some(name) = file.strip_suffix(".plist") else {
                continue;
            };
            items.push(StartupItem {
                name: name.to_owned(),
                command: entry.path().display().to_string(),
                location: location.into(),
                enabled: true,
                machine_wide: machine,
                handle: Handle::ReadOnly,
            });
        }
    }
    items
}

#[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
pub fn list() -> Vec<StartupItem> {
    Vec::new()
}

// ----------------------------------------------------------------- set ---

/// What changing an item needs when it cannot be done in-process.
#[derive(Debug, PartialEq, Eq)]
pub enum SetResult {
    Done,
    /// Windows machine-wide entry: run this PowerShell script elevated.
    NeedsElevation(String),
    Unsupported(String),
}

pub fn set_enabled(item: &StartupItem, enabled: bool) -> Result<SetResult, String> {
    match &item.handle {
        Handle::WindowsApproved {
            hive_machine,
            subkey,
            value,
        } => {
            if *hive_machine {
                let bytes = approved_flag(enabled)
                    .iter()
                    .map(u8::to_string)
                    .collect::<Vec<_>>()
                    .join(",");
                let script = format!(
                    "New-Item -Path {path} -Force | Out-Null; \
                     Set-ItemProperty -Path {path} -Name {name} -Type Binary -Value ([byte[]]({bytes}))",
                    path = crate::core::agent::tools::net::run::ps_quote(&format!(r"HKLM:\{subkey}")),
                    name = crate::core::agent::tools::net::run::ps_quote(value),
                );
                return Ok(SetResult::NeedsElevation(script));
            }
            write_user_approved(subkey, value, enabled)?;
            Ok(SetResult::Done)
        }
        Handle::LinuxDesktop { file, source } => {
            let original = std::fs::read_to_string(source.join(file))
                .map_err(|error| format!("Could not read {file}: {error}"))?;
            let user_dir = dirs::config_dir()
                .ok_or("No user config directory")?
                .join("autostart");
            std::fs::create_dir_all(&user_dir)
                .map_err(|error| format!("Could not create {}: {error}", user_dir.display()))?;
            std::fs::write(user_dir.join(file), desktop_with_hidden(&original, !enabled))
                .map_err(|error| format!("Could not write {file}: {error}"))?;
            Ok(SetResult::Done)
        }
        Handle::ReadOnly => Ok(SetResult::Unsupported(
            "Changing startup items is not supported here yet; use System Settings > General > Login Items.".into(),
        )),
    }
}

#[cfg(windows)]
fn write_user_approved(subkey: &str, value: &str, enabled: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::{RegKey, RegValue};
    let hive = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hive
        .create_subkey_with_flags(subkey, KEY_SET_VALUE)
        .map_err(|error| format!("Could not open the startup settings: {error}"))?;
    key.set_raw_value(
        value,
        &RegValue {
            bytes: approved_flag(enabled),
            vtype: winreg::enums::RegType::REG_BINARY,
        },
    )
    .map_err(|error| format!("Could not change the startup setting: {error}"))
}

#[cfg(not(windows))]
fn write_user_approved(_subkey: &str, _value: &str, _enabled: bool) -> Result<(), String> {
    Err("Windows startup settings are only available on Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(name: &str) -> StartupItem {
        StartupItem {
            name: name.into(),
            command: String::new(),
            location: String::new(),
            enabled: true,
            machine_wide: false,
            handle: Handle::ReadOnly,
        }
    }

    #[test]
    fn items_are_found_by_name_or_the_list_is_shown() {
        let items = vec![item("Spotify"), item("OneDrive")];
        assert_eq!(find(&items, "spotify").unwrap().name, "Spotify");
        let error = find(&items, "Discord").unwrap_err();
        assert!(error.contains("Spotify, OneDrive"));
    }

    #[test]
    fn the_approved_flag_matches_task_manager() {
        assert!(approved_flag_enabled(&[0x02, 0, 0]));
        assert!(approved_flag_enabled(&[0x06]));
        assert!(!approved_flag_enabled(&[0x03, 0, 0]));
        assert!(!approved_flag_enabled(&[0x07]));
        assert!(approved_flag_enabled(&[]));
        assert_eq!(approved_flag(false)[0], 0x03);
        assert_eq!(approved_flag(true)[0], 0x02);
        assert_eq!(approved_flag(true).len(), 12);
    }

    #[test]
    fn desktop_entries_parse_and_toggle() {
        let text = "[Desktop Entry]\nType=Application\nName=Example Sync\nExec=example-sync --tray\n[Desktop Action Quit]\nName=Quit\n";
        assert_eq!(
            parse_desktop_entry(text),
            Some(("Example Sync".into(), "example-sync --tray".into(), true))
        );
        let hidden = desktop_with_hidden(text, true);
        assert!(!parse_desktop_entry(&hidden).unwrap().2);
        assert!(hidden.contains("[Desktop Action Quit]\nName=Quit"));
        let shown = desktop_with_hidden(&hidden, false);
        assert!(parse_desktop_entry(&shown).unwrap().2);
        assert_eq!(shown.matches("Hidden=").count(), 1);
        let gnome_off = "[Desktop Entry]\nName=X\nX-GNOME-Autostart-enabled=false\n";
        assert!(!parse_desktop_entry(gnome_off).unwrap().2);
    }

    #[test]
    fn machine_wide_windows_entries_need_elevation_with_quoted_values() {
        let item = StartupItem {
            handle: Handle::WindowsApproved {
                hive_machine: true,
                subkey: r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
                    .into(),
                value: "Vendor's Agent".into(),
            },
            ..item("Vendor's Agent")
        };
        match set_enabled(&item, false).unwrap() {
            SetResult::NeedsElevation(script) => {
                assert!(script.contains("-Name 'Vendor''s Agent'"));
                assert!(script.contains("[byte[]](3,0,0,0,0,0,0,0,0,0,0,0)"));
            }
            other => panic!("expected elevation, got {other:?}"),
        }
    }
}
