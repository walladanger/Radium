//! The installed panels on disk.
//!
//! One folder per panel under the panels root. A folder that fails validation
//! is reported as broken rather than hidden: a panel that silently vanishes
//! after an edit is far harder to debug than one that says what is wrong with
//! it, and the panel manager shows the errors to whoever installed it.

use super::manifest::{parse_manifest, PanelManifest};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct BrokenPanel {
    pub id: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct InstalledPanel {
    #[serde(flatten)]
    pub manifest: PanelManifest,
    pub path: PathBuf,
}

#[derive(Debug, Default)]
pub struct PanelRegistry {
    panels: BTreeMap<String, InstalledPanel>,
    broken: Vec<BrokenPanel>,
}

impl PanelRegistry {
    /// Read every panel under `root`, creating the directory if it is missing
    /// so a fresh install has somewhere to put one.
    pub fn load(root: &Path) -> Result<Self, String> {
        fs::create_dir_all(root)
            .map_err(|error| format!("Failed to create panels directory: {error}"))?;
        let canonical_root = root
            .canonicalize()
            .map_err(|error| format!("Failed to resolve panels directory: {error}"))?;

        let mut entries: Vec<_> = fs::read_dir(&canonical_root)
            .map_err(|error| format!("Failed to scan panels directory: {error}"))?
            .filter_map(Result::ok)
            .collect();
        entries.sort_by_key(|entry| entry.file_name());

        let mut registry = Self::default();
        for entry in entries {
            let folder = entry.file_name().to_string_lossy().to_string();
            // Dotfiles are housekeeping, not panels.
            if folder.starts_with('.') {
                continue;
            }
            match entry.file_type() {
                Ok(file_type) if file_type.is_dir() => {}
                Ok(_) => continue,
                Err(error) => {
                    registry.broken.push(BrokenPanel {
                        id: folder,
                        errors: vec![format!("could not inspect the folder: {error}")],
                    });
                    continue;
                }
            }

            let panel_root = entry.path();
            // A panel folder that resolves anywhere but directly under the
            // root is a symlink out of the tree; refuse it by containment
            // rather than reasoning about the link itself.
            let canonical_panel_root = match panel_root.canonicalize() {
                Ok(path) if path.parent() == Some(canonical_root.as_path()) => path,
                Ok(_) => {
                    registry.broken.push(BrokenPanel {
                        id: folder,
                        errors: vec!["the folder resolves outside the panels directory".to_string()],
                    });
                    continue;
                }
                Err(error) => {
                    registry.broken.push(BrokenPanel {
                        id: folder,
                        errors: vec![format!("could not resolve the folder: {error}")],
                    });
                    continue;
                }
            };

            registry.add(&folder, &canonical_panel_root);
        }
        Ok(registry)
    }

    fn add(&mut self, folder: &str, panel_root: &Path) {
        let manifest_path = panel_root.join("panel.json");
        // A symlinked manifest could point anywhere; the same reasoning as the
        // skills registry applies, so refuse rather than follow.
        match fs::symlink_metadata(&manifest_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                self.broken.push(BrokenPanel {
                    id: folder.to_string(),
                    errors: vec!["panel.json must not be a symlink".to_string()],
                });
                return;
            }
            Ok(metadata) if !metadata.is_file() => {
                self.broken.push(BrokenPanel {
                    id: folder.to_string(),
                    errors: vec!["panel.json must be a regular file".to_string()],
                });
                return;
            }
            Ok(_) => {}
            Err(_) => {
                self.broken.push(BrokenPanel {
                    id: folder.to_string(),
                    errors: vec!["no panel.json in this folder".to_string()],
                });
                return;
            }
        }

        let source = match fs::read_to_string(&manifest_path) {
            Ok(source) => source,
            Err(error) => {
                self.broken.push(BrokenPanel {
                    id: folder.to_string(),
                    errors: vec![format!("panel.json is unreadable: {error}")],
                });
                return;
            }
        };

        match parse_manifest(&source, Some(folder)) {
            Ok(manifest) => {
                // An entry the manifest promises but the folder does not have
                // would render as a blank panel, so treat it as broken here.
                match super::resolve::resolve_panel_file(panel_root, "/", &manifest.entry) {
                    Ok(_) => {
                        self.panels.insert(
                            manifest.id.clone(),
                            InstalledPanel {
                                manifest,
                                path: panel_root.to_path_buf(),
                            },
                        );
                    }
                    Err(_) => self.broken.push(BrokenPanel {
                        id: folder.to_string(),
                        errors: vec![format!("entry file `{}` not found", manifest.entry)],
                    }),
                }
            }
            Err(errors) => self.broken.push(BrokenPanel {
                id: folder.to_string(),
                errors,
            }),
        }
    }

    pub fn get(&self, id: &str) -> Option<&InstalledPanel> {
        self.panels.get(id)
    }

    pub fn installed(&self) -> impl Iterator<Item = &InstalledPanel> {
        self.panels.values()
    }

    pub fn broken(&self) -> &[BrokenPanel] {
        &self.broken
    }
}
