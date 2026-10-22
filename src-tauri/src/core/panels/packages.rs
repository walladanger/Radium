//! Filesystem lifecycle for both plugin directories. No runtime or UI startup.
use super::manifest::parse_manifest;
use super::registry::PanelRegistry;
use std::{
    fs,
    path::{Path, PathBuf},
};

/// Select a known directory; callers cannot supply a filesystem destination.
pub(super) fn select_root(
    panels: &Path,
    cordis: &Path,
    source: Option<&str>,
) -> Result<PathBuf, String> {
    match source {
        None | Some("panels") => Ok(panels.to_path_buf()),
        Some("cordis") => Ok(cordis.to_path_buf()),
        Some(_) => Err("Unknown plugin directory.".to_string()),
    }
}

/// Install using the existing validated panel bundle contract, preserving global IDs.
pub(super) fn install_package(
    panels: &Path,
    cordis: &Path,
    source_path: &Path,
    source: Option<&str>,
) -> Result<super::manifest::PanelManifest, String> {
    let root = select_root(panels, cordis, source)?;
    let other = if root == panels { cordis } else { panels };
    let folder = source_path
        .file_name()
        .ok_or_else(|| "Could not read the folder name.".to_string())?;
    if other.join(folder).exists() {
        return Err("That ID already exists in the other plugin directory. Rename the folder and manifest ID.".to_string());
    }
    install_from(&root, source_path)
}

pub(super) fn install_from(
    root: &Path,
    source: &Path,
) -> Result<super::manifest::PanelManifest, String> {
    let manifest_path = source.join("panel.json");
    let source_text = fs::read_to_string(&manifest_path)
        .map_err(|_| "That folder has no readable panel.json.".to_string())?;

    // Validated against the folder's own name: `id` has to match, and the
    // copy below trusts `id` for the destination path.
    let folder = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not read the folder name.".to_string())?;
    let manifest = parse_manifest(&source_text, Some(folder))
        .map_err(|errors| format!("Invalid panel.json — {}", errors.join("; ")))?;

    let destination = root.join(&manifest.id);
    fs::create_dir_all(root)
        .map_err(|error| format!("Could not create the panels directory: {error}"))?;

    // Refuse to install a folder onto itself, or onto one of its own
    // ancestors. The replace step below removes the destination first, so
    // without this, picking an already-installed panel's folder — or anything
    // beneath it — would delete the source and then copy nothing, losing the
    // panel outright.
    if let (Ok(source_real), Ok(destination_real)) =
        (source.canonicalize(), destination.canonicalize())
    {
        if source_real == destination_real || source_real.starts_with(&destination_real) {
            return Err(
                "That folder is already installed as this panel; copy it somewhere else first."
                    .to_string(),
            );
        }
    }
    // Replacing rather than merging: a leftover file from an older version of
    // the same panel is exactly the kind of thing that makes an install
    // behave differently from a fresh one.
    if destination.exists() {
        fs::remove_dir_all(&destination)
            .map_err(|error| format!("Could not replace the existing panel: {error}"))?;
    }
    copy_tree(source, &destination).map_err(|error| {
        // Leave nothing half-written behind.
        let _ = fs::remove_dir_all(&destination);
        format!("Could not copy the panel: {error}")
    })?;
    Ok(manifest)
}

/// Copy a directory, refusing symlinks rather than following them — a link in
/// a downloaded panel folder could otherwise pull in anything the user can
/// read.
pub(super) fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(from).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let target = to.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(format!(
                "`{}` is a symbolic link; panels must contain only regular files",
                entry.file_name().to_string_lossy()
            ));
        } else if file_type.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

/// Resolve removal only through discovered packages, never a caller-provided path.
pub(super) fn remove_package(root: &Path, cordis: &Path, id: &str) -> Result<(), String> {
    let registry = PanelRegistry::load_combined(root, cordis)?;
    let path = if let Some(panel) = registry.get(id) {
        panel.path.clone()
    } else {
        let broken = registry
            .broken()
            .iter()
            .find(|panel| panel.id == id)
            .ok_or_else(|| format!("No panel called {id} is installed."))?;
        if let Some(folder) = broken.id.strip_prefix("cordis:") {
            cordis.join(folder)
        } else if let Some(folder) = broken.id.strip_prefix("panels:") {
            root.join(folder)
        } else {
            return Err("Unknown plugin directory.".to_string());
        }
    };
    // Installed paths are canonical; broken folder names come from read_dir.
    // Resolve their parent only so an invalid symlink can be removed without following it.
    let parent = path.parent().and_then(|parent| parent.canonicalize().ok());
    let regular = root.canonicalize().map_err(|error| error.to_string())?;
    let plugins = cordis.canonicalize().map_err(|error| error.to_string())?;
    if parent.as_ref() != Some(&regular) && parent.as_ref() != Some(&plugins) {
        return Err("That panel is not inside a plugin directory.".to_string());
    }
    fs::remove_dir_all(&path).map_err(|error| format!("Could not remove the panel: {error}"))
}
