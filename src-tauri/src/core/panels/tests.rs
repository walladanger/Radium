//! Panel host tests.
//!
//! The manifest cases are checked against the same fixtures
//! `tests/panel-contract.test.mjs` uses, so the Rust validator and the JSON
//! schema cannot drift apart without one of the two suites failing. The path
//! cases are the ones that matter most: every refusal here is an attempt to
//! read something outside the panel's folder.

use super::manifest::{parse_manifest, CORE_PERMISSIONS};
use super::protocol::{serve, split_request, PANEL_CSP};
use super::registry::PanelRegistry;
use super::resolve::{resolve_panel_file, RefusedPath};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::http::Request;

fn fixtures() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/panels")
}

fn contract_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/panel-contract")
}

/// A panels root with one working panel in it.
fn temp_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("radium-panel-tests-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("create panels root");
    root
}

fn write_panel(root: &Path, id: &str, manifest: &str, entry_body: &str) -> PathBuf {
    let dir = root.join(id);
    fs::create_dir_all(&dir).expect("create panel dir");
    fs::write(dir.join("panel.json"), manifest).expect("write manifest");
    fs::write(dir.join("index.html"), entry_body).expect("write entry");
    dir
}

fn good_manifest(id: &str) -> String {
    format!(
        r#"{{ "contract": 1, "id": "{id}", "name": "Test panel", "entry": "index.html" }}"#
    )
}

#[test]
fn the_conformance_fixture_is_accepted() {
    let source = fs::read_to_string(fixtures().join("conformance/panel.json")).unwrap();
    let manifest = parse_manifest(&source, Some("contract-conformance")).expect("fixture must pass");
    assert_eq!(manifest.contract, 1);
    assert_eq!(manifest.id, "contract-conformance");
    assert!(manifest.allows("storage"));
    assert!(manifest.allows("mcp.read"));
    // Declared permissions are the whole grant: nothing else is implied.
    assert!(!manifest.allows("mcp.call"));
    assert!(manifest.allows_server("fixture-server"));
    assert!(!manifest.allows_server("some-other-server"));
}

#[test]
fn every_invalid_fixture_is_rejected_for_its_own_reason() {
    // Mirrors the expectations in tests/panel-contract.test.mjs; if the schema
    // and this validator disagree about a case, one of the two suites fails.
    let cases = [
        ("missing-contract.json", "missing `contract`"),
        ("wrong-contract.json", "this host implements 1"),
        ("bad-id.json", "`id` must be lowercase"),
        ("traversal-entry.json", "inside the panel folder"),
        ("unknown-key.json", "panel.json is not valid"),
        ("mcp-without-servers.json", "`mcpServers` is required"),
    ];
    let dir = fixtures().join("invalid");
    let on_disk = fs::read_dir(&dir)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "json"))
        .count();
    assert_eq!(on_disk, cases.len(), "every invalid fixture needs a case here");

    for (file, expected) in cases {
        let source = fs::read_to_string(dir.join(file)).unwrap();
        let errors = parse_manifest(&source, None).expect_err(&format!("{file} must be rejected"));
        assert!(
            errors.iter().any(|error| error.contains(expected)),
            "{file} should mention {expected:?}, got {errors:?}"
        );
    }
}

#[test]
fn the_folder_name_has_to_match_the_id() {
    let errors = parse_manifest(&good_manifest("one-name"), Some("another-name")).unwrap_err();
    assert!(errors.iter().any(|e| e.contains("must match the folder name")));
}

#[test]
fn core_permissions_are_the_portable_set_and_everything_else_is_namespaced() {
    let base = |permissions: &str| {
        format!(
            r#"{{ "contract": 1, "id": "perm-panel", "name": "P", "entry": "index.html", "permissions": {permissions} }}"#
        )
    };
    for permission in CORE_PERMISSIONS {
        let extra = if permission.starts_with("mcp") {
            r#", "mcpServers": []"#
        } else {
            ""
        };
        let source = format!(
            r#"{{ "contract": 1, "id": "perm-panel", "name": "P", "entry": "index.html", "permissions": ["{permission}"]{extra} }}"#
        );
        assert!(parse_manifest(&source, None).is_ok(), "{permission} must be accepted");
    }
    // Another host's capability, namespaced: expressible, so a panel stays
    // installable where it is understood.
    assert!(parse_manifest(&base(r#"["cdc:usage.read"]"#), None).is_ok());
    // The same capability unprefixed is refused, because unprefixed names are
    // reserved for the portable core.
    assert!(parse_manifest(&base(r#"["usage.read"]"#), None).is_err());
    assert!(parse_manifest(&base(r#"["storage", "storage"]"#), None).is_err());
}

#[test]
fn asking_for_mcp_without_an_allowlist_is_refused_but_an_empty_one_is_not() {
    let with = r#"{ "contract": 1, "id": "mcp-panel", "name": "P", "entry": "index.html", "permissions": ["mcp.call"], "mcpServers": [] }"#;
    let without = r#"{ "contract": 1, "id": "mcp-panel", "name": "P", "entry": "index.html", "permissions": ["mcp.call"] }"#;
    assert!(parse_manifest(with, None).is_ok(), "an empty allowlist is a deliberate nothing");
    assert!(parse_manifest(without, None).is_err());
}

#[test]
fn a_traversing_request_is_refused_rather_than_clamped() {
    let root = temp_root("traversal");
    let panel = write_panel(&root, "traversal-panel", &good_manifest("traversal-panel"), "<p>hi");
    fs::write(root.join("secret.txt"), "not yours").unwrap();

    for request in ["/../secret.txt", "/../../etc/passwd", "/nested/../../secret.txt"] {
        let refusal = resolve_panel_file(&panel, request, "index.html").unwrap_err();
        assert_eq!(refusal, RefusedPath::Suspicious, "{request} must be refused outright");
    }
    // The entry itself still resolves.
    assert!(resolve_panel_file(&panel, "/", "index.html").is_ok());
    let _ = fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn a_symlink_out_of_the_folder_is_refused_by_containment() {
    let root = temp_root("symlink");
    let panel = write_panel(&root, "symlink-panel", &good_manifest("symlink-panel"), "<p>hi");
    let outside = root.join("outside.html");
    fs::write(&outside, "<p>not yours").unwrap();
    std::os::unix::fs::symlink(&outside, panel.join("escape.html")).unwrap();

    // The path looks innocent; only canonicalising and checking containment
    // catches it, which is exactly why resolve does both.
    let refusal = resolve_panel_file(&panel, "/escape.html", "index.html").unwrap_err();
    assert_eq!(refusal, RefusedPath::Escapes);
    let _ = fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn a_symlinked_manifest_makes_the_panel_broken_not_loaded() {
    let root = temp_root("symlink-manifest");
    let elsewhere = root.join("elsewhere.json");
    fs::write(&elsewhere, good_manifest("sneaky-panel")).unwrap();
    let dir = root.join("sneaky-panel");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("index.html"), "<p>hi").unwrap();
    std::os::unix::fs::symlink(&elsewhere, dir.join("panel.json")).unwrap();

    let registry = PanelRegistry::load(&root).unwrap();
    assert!(registry.get("sneaky-panel").is_none());
    assert!(registry
        .broken()
        .iter()
        .any(|panel| panel.id == "sneaky-panel" && panel.errors.iter().any(|e| e.contains("symlink"))));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn a_broken_panel_is_reported_rather_than_hidden() {
    let root = temp_root("broken");
    write_panel(&root, "good-panel", &good_manifest("good-panel"), "<p>hi");
    // Valid JSON, invalid manifest.
    write_panel(&root, "bad-panel", r#"{ "contract": 1, "id": "bad-panel" }"#, "<p>hi");
    // Promises an entry it does not have.
    let missing = root.join("missing-entry");
    fs::create_dir_all(&missing).unwrap();
    fs::write(
        missing.join("panel.json"),
        r#"{ "contract": 1, "id": "missing-entry", "name": "P", "entry": "nope.html" }"#,
    )
    .unwrap();

    let registry = PanelRegistry::load(&root).unwrap();
    assert!(registry.get("good-panel").is_some());
    assert_eq!(registry.installed().count(), 1);
    let broken: Vec<&str> = registry.broken().iter().map(|p| p.id.as_str()).collect();
    assert!(broken.contains(&"bad-panel"));
    assert!(broken.contains(&"missing-entry"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn served_panel_files_carry_the_restrictive_csp() {
    let root = temp_root("serve");
    write_panel(&root, "served-panel", &good_manifest("served-panel"), "<p>hello");

    let response = serve(&root, &contract_dir(), "served-panel", "/");
    assert_eq!(response.status(), 200);
    let csp = response
        .headers()
        .get("Content-Security-Policy")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    assert!(csp.contains("connect-src 'none'"), "a panel must not reach the network");
    assert!(!csp.contains("unsafe-eval"), "unsafe-eval was dropped app-wide; panels do not get it back");
    assert_eq!(
        response.headers().get("Content-Type").unwrap(),
        "text/html; charset=utf-8"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn the_frozen_contract_files_are_served_to_every_panel() {
    let root = temp_root("shared");
    write_panel(&root, "shared-panel", &good_manifest("shared-panel"), "<p>hi");

    for (file, expected) in [
        ("/panel-sdk.js", "text/javascript; charset=utf-8"),
        ("/panel-theme.css", "text/css; charset=utf-8"),
    ] {
        let response = serve(&root, &contract_dir(), "shared-panel", file);
        assert_eq!(response.status(), 200, "{file} must be served");
        assert_eq!(response.headers().get("Content-Type").unwrap(), expected);
    }
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn an_unknown_panel_and_a_refused_path_say_nothing_useful() {
    let root = temp_root("refusals");
    write_panel(&root, "known-panel", &good_manifest("known-panel"), "<p>hi");

    assert_eq!(serve(&root, &contract_dir(), "no-such-panel", "/").status(), 404);
    assert_eq!(serve(&root, &contract_dir(), "known-panel", "/../secret").status(), 403);
    assert_eq!(serve(&root, &contract_dir(), "known-panel", "/nope.html").status(), 404);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn both_url_shapes_resolve_to_the_same_panel() {
    let build = |uri: &str| {
        let request = Request::builder().uri(uri).body(Vec::new()).unwrap();
        split_request(&request)
    };

    // macOS and Linux.
    assert_eq!(
        build("panel://my-panel/index.html"),
        Some(("my-panel".to_string(), "/index.html".to_string()))
    );
    // Windows serves custom schemes over http://<scheme>.localhost.
    assert_eq!(
        build("http://panel.localhost/my-panel/index.html"),
        Some(("my-panel".to_string(), "/index.html".to_string()))
    );
    assert_eq!(
        build("http://panel.localhost/my-panel"),
        Some(("my-panel".to_string(), "/".to_string()))
    );
    assert_eq!(build("http://panel.localhost/"), None);
}

#[test]
fn the_csp_constant_is_what_the_spec_promises() {
    for directive in [
        "default-src 'self'",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ] {
        assert!(PANEL_CSP.contains(directive), "missing {directive}");
    }
}
