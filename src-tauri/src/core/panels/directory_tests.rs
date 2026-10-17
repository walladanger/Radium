//! Directory regressions shared by native tests and the lightweight host check.
use super::protocol::PANEL_CSP;
use super::registry::PanelRegistry;
use std::{
    fs,
    path::{Path, PathBuf},
};

fn temp_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("radium-directory-{name}-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    root
}

fn write_panel(root: &Path, id: &str, manifest: &str, body: &str) {
    let folder = root.join(id);
    fs::create_dir_all(&folder).unwrap();
    fs::write(folder.join("panel.json"), manifest).unwrap();
    fs::write(folder.join("index.html"), body).unwrap();
}

fn good_manifest(id: &str) -> String {
    format!(r#"{{"contract":1,"id":"{id}","name":"Test panel","entry":"index.html"}}"#)
}

fn contract_dir() -> PathBuf {
    Path::new(file!())
        .canonicalize()
        .unwrap()
        .parent()
        .unwrap()
        .join("../../../resources/panel-contract")
        .canonicalize()
        .unwrap()
}

#[test]
fn cordis_directory_joins_the_same_registry_and_protocol() {
    let root = temp_root("cordis-unified");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &panels,
        "regular-panel",
        &good_manifest("regular-panel"),
        "regular",
    );
    write_panel(
        &cordis,
        "cordis-demo",
        &good_manifest("cordis-demo"),
        "Cordis GUI",
    );
    let registry = PanelRegistry::load_combined(&panels, &cordis).unwrap();
    assert_eq!(registry.installed().count(), 2);
    assert_eq!(
        registry.get("cordis-demo").unwrap().path,
        cordis.join("cordis-demo").canonicalize().unwrap()
    );
    let response =
        super::protocol::serve_with_cordis(&panels, &cordis, &contract_dir(), "cordis-demo", "/");
    assert_eq!(response.status(), 200);
    assert_eq!(response.body().as_ref(), b"Cordis GUI");
    assert_eq!(
        response.headers().get("Content-Security-Policy").unwrap(),
        PANEL_CSP
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cordis_duplicate_ids_cannot_replace_an_existing_panel() {
    let root = temp_root("cordis-duplicate");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &panels,
        "shared-id",
        &good_manifest("shared-id"),
        "original",
    );
    write_panel(
        &cordis,
        "shared-id",
        &good_manifest("shared-id"),
        "conflicting",
    );
    let registry = PanelRegistry::load_combined(&panels, &cordis).unwrap();
    // Ambiguous IDs are disabled in both roots so neither bridge nor storage can change owner.
    assert!(registry.get("shared-id").is_none());
    assert_eq!(registry.broken().len(), 2);
    assert!(registry
        .broken()
        .iter()
        .any(|panel| panel.id == "cordis:shared-id"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cordis_broken_manifest_is_reported_with_its_directory() {
    let root = temp_root("cordis-broken");
    let cordis = root.join("plugins/cordis");
    write_panel(&cordis, "bad-gui", "{}", "broken");
    let registry = PanelRegistry::load_combined(&root.join("panels"), &cordis).unwrap();
    assert!(registry.get("bad-gui").is_none());
    assert_eq!(registry.broken()[0].id, "cordis:bad-gui");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cordis_gui_cannot_read_a_neighbor_or_parent_file() {
    let root = temp_root("cordis-paths");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(&cordis, "cordis-demo", &good_manifest("cordis-demo"), "GUI");
    fs::write(root.join("private.txt"), "secret").unwrap();
    let response = super::protocol::serve_with_cordis(
        &panels,
        &cordis,
        &contract_dir(),
        "cordis-demo",
        "/../../../private.txt",
    );
    assert_eq!(response.status(), 403);
    let missing =
        super::protocol::serve_with_cordis(&panels, &cordis, &contract_dir(), "not-installed", "/");
    assert_eq!(missing.status(), 404);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn broken_regular_id_also_reserves_its_bridge_identity() {
    let root = temp_root("cordis-broken-collision");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(&panels, "shared-id", "{}", "broken");
    write_panel(&cordis, "shared-id", &good_manifest("shared-id"), "GUI");
    let registry = PanelRegistry::load_combined(&panels, &cordis).unwrap();
    assert!(registry.get("shared-id").is_none());
    assert!(registry
        .broken()
        .iter()
        .any(|panel| panel.id == "panels:shared-id"));
    assert!(registry
        .broken()
        .iter()
        .any(|panel| panel.id == "cordis:shared-id"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn install_and_remove_cordis_use_the_separate_directory() {
    let root = temp_root("cordis-install-remove");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &root.join("staging"),
        "cordis-demo",
        &good_manifest("cordis-demo"),
        "GUI",
    );
    let source = root.join("staging/cordis-demo");
    super::packages::install_package(&panels, &cordis, &source, Some("cordis")).unwrap();
    assert!(cordis.join("cordis-demo/index.html").exists());
    assert!(!panels.join("cordis-demo").exists());
    super::packages::remove_package(&panels, &cordis, "cordis-demo").unwrap();
    assert!(!cordis.join("cordis-demo").exists());
    assert!(source.join("index.html").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn install_cannot_reuse_a_package_id_from_the_other_directory() {
    let root = temp_root("cordis-install-collision");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &panels,
        "shared-id",
        &good_manifest("shared-id"),
        "original",
    );
    write_panel(
        &root.join("staging"),
        "shared-id",
        &good_manifest("shared-id"),
        "incoming",
    );
    assert!(super::packages::install_package(
        &panels,
        &cordis,
        &root.join("staging/shared-id"),
        Some("cordis")
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(panels.join("shared-id/index.html")).unwrap(),
        "original"
    );
    assert!(!cordis.join("shared-id").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn old_install_call_still_targets_regular_panels() {
    let root = temp_root("cordis-default-install");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &root.join("staging"),
        "old-panel",
        &good_manifest("old-panel"),
        "regular",
    );
    super::packages::install_package(&panels, &cordis, &root.join("staging/old-panel"), None)
        .unwrap();
    assert!(panels.join("old-panel/index.html").exists());
    assert!(!cordis.join("old-panel").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn remove_broken_cordis_package_leaves_regular_package_untouched() {
    let root = temp_root("cordis-broken-remove");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    write_panel(
        &panels,
        "shared-id",
        &good_manifest("shared-id"),
        "original",
    );
    write_panel(&cordis, "shared-id", "{}", "invalid");
    super::packages::remove_package(&panels, &cordis, "cordis:shared-id").unwrap();
    assert!(panels.join("shared-id/index.html").exists());
    assert!(!cordis.join("shared-id").exists());
    assert!(PanelRegistry::load_combined(&panels, &cordis)
        .unwrap()
        .get("shared-id")
        .is_some());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn directory_selection_and_removal_cannot_accept_arbitrary_paths() {
    let root = temp_root("cordis-reject-path");
    let panels = root.join("panels");
    let cordis = root.join("plugins/cordis");
    fs::write(root.join("private.txt"), "keep").unwrap();
    assert!(super::packages::select_root(&panels, &cordis, Some("../../elsewhere")).is_err());
    assert!(super::packages::remove_package(&panels, &cordis, "cordis:../../private.txt").is_err());
    assert_eq!(
        fs::read_to_string(root.join("private.txt")).unwrap(),
        "keep"
    );
    fs::remove_dir_all(root).unwrap();
}
