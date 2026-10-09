use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

use super::{
    discovery::{discover_skill_folders, DiscoveredSkill},
    manifest::parse_skill_file,
    organization::{BUNDLED_CATALOG_FILE, INSTALLED_CATALOG_FILE},
};

const REMOVED_STARTER_SKILLS: &[&str] = &["ddgr-web-search", "exa-web-search"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeedStarterSkillsResult {
    pub installed: Vec<String>,
    pub removed: Vec<String>,
}

/// The bundled skills, flat or in category folders, each by name with its
/// path below `source_root`. When two bundled folders share a name only the
/// first (nearest the root, then by path) is kept, and the other is logged.
pub fn list_starter_skills(source_root: &Path) -> Vec<DiscoveredSkill> {
    let Ok(discovery) = discover_skill_folders(source_root) else {
        return Vec::new();
    };
    let mut seen = BTreeSet::new();
    discovery
        .skills
        .into_iter()
        .filter(|skill| {
            let first = seen.insert(skill.folder_name.clone());
            if !first {
                log::warn!(
                    "Bundled skill `{}` at `{}` duplicates another bundled skill's name and is skipped",
                    skill.folder_name,
                    skill.relative_path()
                );
            }
            first
        })
        .collect()
}

pub fn list_starter_skill_names(source_root: &Path) -> BTreeSet<String> {
    list_starter_skills(source_root)
        .into_iter()
        .map(|skill| skill.folder_name)
        .collect()
}

pub fn seed_starter_skills(
    source_root: &Path,
    destination_root: &Path,
) -> Result<SeedStarterSkillsResult, String> {
    seed_starter_skills_following(source_root, destination_root, &BTreeSet::new())
}

/// Install the bundled skills into the data folder at the same relative
/// paths they have in the bundle, so category folders carry over.
///
/// `previously_bundled` is the name list the last launch recorded. A bundled
/// skill already installed somewhere else in the data folder - because the
/// user moved it into a category folder of their own, or because it sat at
/// another path in an older bundle - is updated where it is, so a user's
/// arrangement survives updates and no duplicate appears. Folders the user
/// made are never touched unless they sit exactly where a bundled skill is
/// installed, which is how seeding has always behaved.
pub fn seed_starter_skills_following(
    source_root: &Path,
    destination_root: &Path,
    previously_bundled: &BTreeSet<String>,
) -> Result<SeedStarterSkillsResult, String> {
    fs::create_dir_all(destination_root)
        .map_err(|error| format!("Failed to create agent skills directory: {error}"))?;
    let mut removed = Vec::new();
    for name in REMOVED_STARTER_SKILLS {
        let destination = destination_root.join(name);
        if destination.exists() {
            fs::remove_dir_all(&destination)
                .map_err(|error| format!("Failed to prune starter skill `{name}`: {error}"))?;
            removed.push((*name).to_string());
        }
    }
    if !source_root.is_dir() {
        return Ok(SeedStarterSkillsResult {
            installed: Vec::new(),
            removed,
        });
    }
    let existing = discover_skill_folders(destination_root)
        .map(|discovery| discovery.skills)
        .unwrap_or_default();
    let mut installed = Vec::new();
    for skill in list_starter_skills(source_root) {
        let name = skill.folder_name.clone();
        let relative = previously_bundled
            .contains(&name)
            .then(|| {
                existing
                    .iter()
                    .find(|installed| installed.folder_name == name)
                    .map(DiscoveredSkill::relative_path)
            })
            .flatten()
            .unwrap_or_else(|| skill.relative_path());
        // One bad bundled skill must not stop the rest from being seeded: the
        // set is installed in order, so aborting here left every skill after
        // the first invalid one missing from the data folder. It is installed
        // anyway and the registry reports it as broken, with the reason.
        match fs::read_to_string(skill.path.join("SKILL.md")) {
            Ok(content) => match parse_skill_file(&content) {
                Ok(parsed) if parsed.manifest.name != name => log::warn!(
                    "Bundled skill `{relative}` declares name `{}`",
                    parsed.manifest.name
                ),
                Ok(_) => {}
                Err(error) => log::warn!("Invalid bundled skill `{relative}`: {error}"),
            },
            Err(error) => log::warn!("Failed to read bundled skill `{relative}`: {error}"),
        }
        let destination = destination_root.join(&relative);
        let temporary = temporary_seed_path(destination_root, &name);
        if temporary.exists() {
            fs::remove_dir_all(&temporary).map_err(|error| {
                format!("Failed to clear temporary starter skill `{name}`: {error}")
            })?;
        }
        copy_tree(&skill.path, &temporary)?;
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("Failed to create category folder for starter skill `{name}`: {error}")
            })?;
        }
        if destination.exists() {
            // A category folder of the user's that happens to share a bundled
            // skill's name holds their skills: never replace it.
            if !destination.join("SKILL.md").exists() {
                log::warn!(
                    "Bundled skill `{name}` was not installed: `{relative}` is a category folder"
                );
                let _ = fs::remove_dir_all(&temporary);
                continue;
            }
            fs::remove_dir_all(&destination)
                .map_err(|error| format!("Failed to replace starter skill `{name}`: {error}"))?;
        }
        fs::rename(&temporary, &destination)
            .map_err(|error| format!("Failed to install starter skill `{name}`: {error}"))?;
        installed.push(name);
    }
    installed.sort();
    install_catalog(source_root, destination_root);
    Ok(SeedStarterSkillsResult { installed, removed })
}

/// Copy the bundled `_catalog.json` next to the installed skills, where the
/// registry reads it. A bundle without one removes a stale copy.
fn install_catalog(source_root: &Path, destination_root: &Path) {
    let source = source_root.join(BUNDLED_CATALOG_FILE);
    let destination = destination_root.join(INSTALLED_CATALOG_FILE);
    let result = if source.is_file() {
        fs::copy(&source, &destination).map(|_| ())
    } else if destination.exists() {
        fs::remove_file(&destination)
    } else {
        Ok(())
    };
    if let Err(error) = result {
        log::warn!("Failed to install the bundled skills catalog: {error}");
    }
}

fn temporary_seed_path(root: &Path, name: &str) -> PathBuf {
    root.join(format!(".{name}.seed-tmp"))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Failed to create bundled skill directory: {error}"))?;
    let mut entries = fs::read_dir(source)
        .map_err(|error| format!("Failed to scan bundled skill directory: {error}"))?
        .filter_map(Result::ok)
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to inspect bundled skill entry: {error}"))?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &target)
                .map_err(|error| format!("Failed to copy bundled skill file: {error}"))?;
        } else {
            return Err(format!(
                "Bundled skill entry `{}` must not be a symlink",
                entry.path().display()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::core::agent::skills::SkillPlatform;
    use tempfile::TempDir;

    fn write_skill(root: &Path, name: &str, body: &str) {
        let directory = root.join(name);
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            directory.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Test\n---\n{body}"),
        )
        .unwrap();
    }

    #[test]
    fn replaces_reserved_skills_and_preserves_custom_directories() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        write_skill(&source, "starter", "new");
        write_skill(&destination, "starter", "old");
        write_skill(&destination, "custom", "custom");
        let result = seed_starter_skills(&source, &destination).unwrap();
        assert_eq!(result.installed, ["starter"]);
        assert!(fs::read_to_string(destination.join("starter/SKILL.md"))
            .unwrap()
            .ends_with("new"));
        assert!(destination.join("custom/SKILL.md").exists());
    }

    #[test]
    fn prunes_explicit_tombstones() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        fs::create_dir_all(&source).unwrap();
        write_skill(&destination, REMOVED_STARTER_SKILLS[0], "old");
        let result = seed_starter_skills(&source, &destination).unwrap();
        assert_eq!(result.removed, [REMOVED_STARTER_SKILLS[0]]);
        assert!(!destination.join(REMOVED_STARTER_SKILLS[0]).exists());
    }

    #[test]
    fn seeds_nested_bundled_skills_at_their_relative_paths() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        write_skill(&source, "flat-skill", "flat");
        write_skill(&source.join("graphics"), "logo-maker", "logo");
        write_skill(&source.join("code/rust"), "cargo-helper", "cargo");
        fs::write(
            source.join(BUNDLED_CATALOG_FILE),
            r#"{"version":1,"skills":{}}"#,
        )
        .unwrap();

        let result = seed_starter_skills(&source, &destination).unwrap();

        assert_eq!(
            result.installed,
            ["cargo-helper", "flat-skill", "logo-maker"]
        );
        assert!(destination.join("graphics/logo-maker/SKILL.md").is_file());
        assert!(destination
            .join("code/rust/cargo-helper/SKILL.md")
            .is_file());
        assert!(destination.join("flat-skill/SKILL.md").is_file());
        assert!(destination.join(INSTALLED_CATALOG_FILE).is_file());
        assert!(!destination.join(BUNDLED_CATALOG_FILE).exists());
    }

    #[test]
    fn a_bundled_skill_the_user_moved_is_updated_where_it_is() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        write_skill(&source, "starter", "new");
        write_skill(&destination.join("my-tools"), "starter", "old");
        let previously = BTreeSet::from(["starter".to_string()]);

        seed_starter_skills_following(&source, &destination, &previously).unwrap();

        assert!(
            fs::read_to_string(destination.join("my-tools/starter/SKILL.md"))
                .unwrap()
                .ends_with("new")
        );
        assert!(!destination.join("starter").exists());
    }

    #[test]
    fn never_replaces_a_category_folder_that_shares_a_bundled_name() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        write_skill(&source, "github", "bundled");
        write_skill(&destination.join("github"), "my-pr-helper", "mine");

        let result = seed_starter_skills(&source, &destination).unwrap();

        assert!(result.installed.is_empty());
        assert!(destination.join("github/my-pr-helper/SKILL.md").is_file());
        assert!(!destination.join("github/SKILL.md").exists());
    }

    #[test]
    fn invalid_bundled_skills_do_not_stop_seeding() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        fs::create_dir_all(source.join("aa-broken")).unwrap();
        fs::write(source.join("aa-broken/SKILL.md"), "no frontmatter").unwrap();
        write_skill(&source, "bb-renamed", "body");
        fs::write(
            source.join("bb-renamed/SKILL.md"),
            "---\nname: other-name\ndescription: Test\n---\nbody",
        )
        .unwrap();
        write_skill(&source.join("zz"), "zz-valid", "valid");

        let result = seed_starter_skills(&source, &destination).unwrap();

        assert_eq!(result.installed, ["aa-broken", "bb-renamed", "zz-valid"]);
        assert!(destination.join("zz/zz-valid/SKILL.md").is_file());
    }

    #[test]
    fn duplicate_bundled_names_install_once() {
        let temp = TempDir::new().unwrap();
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        write_skill(&source, "twin", "root copy");
        write_skill(&source.join("nested"), "twin", "nested copy");

        let result = seed_starter_skills(&source, &destination).unwrap();

        assert_eq!(result.installed, ["twin"]);
        assert!(fs::read_to_string(destination.join("twin/SKILL.md"))
            .unwrap()
            .ends_with("root copy"));
        assert!(!destination.join("nested/twin").exists());
    }

    /// Every bundled skill is placed in the fixed category list with a
    /// creator, by `_catalog.json`, so a newly bundled skill cannot land in
    /// "Other / Unknown" unnoticed. Entries for skills not bundled (yet) are
    /// allowed: the catalog may run ahead of an open pull request.
    #[test]
    fn every_bundled_skill_has_a_catalog_entry_in_a_known_category() {
        use crate::core::agent::skills::organization::{SkillCatalog, SKILL_CATEGORIES};

        let source = bundled_skills_root();
        let catalog_path = source.join(BUNDLED_CATALOG_FILE);
        let content = fs::read_to_string(&catalog_path).unwrap();
        let catalog: SkillCatalog = serde_json::from_str(&content).unwrap();
        assert_eq!(catalog.version, 1);

        let missing: Vec<String> = list_starter_skill_names(&source)
            .into_iter()
            .filter(|name| !catalog.skills.contains_key(name))
            .collect();
        assert!(
            missing.is_empty(),
            "bundled skills without a `{BUNDLED_CATALOG_FILE}` entry: {missing:?}"
        );
        for (name, entry) in &catalog.skills {
            assert!(
                SKILL_CATEGORIES.contains(&entry.category.as_str()),
                "`{name}` has category `{}`, which is not in SKILL_CATEGORIES",
                entry.category
            );
            assert!(!entry.creator.trim().is_empty(), "`{name}` has no creator");
        }
    }

    /// The bundled skills this repository added and reviewed one at a time.
    ///
    /// `resources/agent-skills` holds two different things. These are ours:
    /// each was added deliberately, with its platform policy and its length
    /// reviewed. The rest is the NVIDIA skills catalog — see that folder's own
    /// README, which says the product folders are mirrored from their source
    /// repositories by automation and must not be hand-edited.
    ///
    /// The authoring limits asserted below are this repository's rules for
    /// skills *we* write, so they are asserted against the reviewed set.
    /// Asserting them against the mirror leaves only bad options: edit
    /// vendored content, or raise a limit that exists to keep hand-written
    /// skills honest. What the mirror can break instead is pinned, so it
    /// cannot get worse quietly — see the two tests below.
    fn reviewed_platform_policy() -> BTreeMap<&'static str, Vec<SkillPlatform>> {
        use SkillPlatform::{Darwin, Linux, Win32};

        BTreeMap::from([
            ("apple-calendar", vec![Darwin]),
            ("apple-notes", vec![Darwin]),
            ("apple-reminders", vec![Darwin]),
            ("audio-transcribe", vec![Darwin, Linux]),
            ("currency", vec![Darwin, Linux, Win32]),
            ("docker", vec![Darwin, Linux, Win32]),
            ("ffmpeg", vec![Darwin, Linux, Win32]),
            ("github", vec![Darwin, Linux, Win32]),
            ("gog-workspace", vec![Darwin, Linux]),
            ("imagemagick", vec![Darwin, Linux, Win32]),
            ("notion", vec![Darwin, Linux]),
            ("obsidian", vec![Darwin, Linux]),
            ("pandoc", vec![Darwin, Linux, Win32]),
            ("pdf", vec![Darwin, Linux, Win32]),
            ("skill-creator", vec![Darwin, Linux, Win32]),
            ("uupm-banner-design", vec![Darwin, Linux, Win32]),
            ("uupm-brand", vec![Darwin, Linux, Win32]),
            ("uupm-design", vec![Darwin, Linux, Win32]),
            ("uupm-design-system", vec![Darwin, Linux, Win32]),
            ("uupm-slides", vec![Darwin, Linux, Win32]),
            ("uupm-ui-styling", vec![Darwin, Linux, Win32]),
            ("uupm-ui-ux-pro-max", vec![Darwin, Linux, Win32]),
            ("wikipedia", vec![Darwin, Linux, Win32]),
            ("wttr-weather", vec![Darwin, Linux, Win32]),
            ("xlsx", vec![Darwin, Linux]),
        ])
    }

    fn bundled_skills_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/agent-skills")
    }

    #[test]
    fn bundled_skills_follow_explicit_platform_metadata_policy() {
        let source = bundled_skills_root();
        let expected = reviewed_platform_policy();

        let names = list_starter_skill_names(&source);
        assert!(!names.is_empty(), "bundled starter skills must exist");

        // Skills that declare a `platforms` restriction must appear in the
        // reviewed policy with it. Skills without a restriction — the whole
        // mirrored catalog included — are available everywhere and need no
        // entry, which is what makes the policy a review record rather than
        // an inventory.
        for name in names {
            let skill_root = source.join(&name);
            let content = fs::read_to_string(skill_root.join("SKILL.md")).unwrap();
            let reviewed = expected.contains_key(name.as_str());
            let parsed = match parse_skill_file(&content) {
                Ok(parsed) => parsed,
                Err(reason) => {
                    assert!(
                        !reviewed,
                        "reviewed bundled skill `{name}` no longer parses: {reason}"
                    );
                    // A mirrored skill the parser refuses is pinned by
                    // `mirrored_skills_the_parser_refuses_stay_pinned`.
                    // Failing here too would only bury the platform policy
                    // under that same breakage.
                    continue;
                }
            };
            assert_eq!(
                parsed.manifest.platforms.as_ref(),
                expected.get(name.as_str()),
                "platform metadata changed for bundled skill `{name}`; review and update the policy explicitly"
            );
            for script in &parsed.manifest.requires_scripts {
                assert!(
                    skill_root.join("scripts").join(script).is_file(),
                    "bundled skill `{name}` declares missing script `{script}`"
                );
            }
        }
    }

    /// Mirrored skills this repository's parser refuses outright.
    ///
    /// Every one has a `description` that folds out past the 512-character
    /// cap. The NVIDIA catalog writes long multi-paragraph trigger
    /// descriptions as YAML folded scalars, and folded they run from 517
    /// characters upwards. The app does not hide them: the skills registry
    /// reports each as broken, with the reason, so a user can see what is
    /// wrong rather than wondering where a skill went.
    ///
    /// Not repaired here, because every repair available is worse than the
    /// symptom. The catalog is mirrored from product repositories by
    /// automation and its own README says the product folders must not be
    /// hand-edited, so editing 91 descriptions would be undone by the next
    /// sync. Raising the cap instead would weaken it for hand-written skills,
    /// whose descriptions go into every prompt — which is what the cap is
    /// for.
    ///
    /// So what is asserted is the part that must not slip:
    ///
    /// 1. no *reviewed* skill is ever among the refused — ours always parse,
    ///    and that is a hard assertion with no ceiling;
    /// 2. the count cannot grow. A mirror update that brings more broken
    ///    skills fails here instead of shipping them quietly. The ceiling is
    ///    the count as imported, so it records the state rather than blessing
    ///    it, and it may shrink freely.
    #[test]
    fn mirrored_skills_the_parser_refuses_cannot_grow() {
        /// The count when the NVIDIA catalog was imported (`d60f2408`), all of
        /// them over-long descriptions. Lower it when upstream shortens one;
        /// never raise it.
        const REFUSED_CEILING: usize = 91;

        let source = bundled_skills_root();
        let reviewed = reviewed_platform_policy();
        let refused: Vec<String> = list_starter_skill_names(&source)
            .into_iter()
            .filter(|name| {
                let content = fs::read_to_string(source.join(name).join("SKILL.md")).unwrap();
                parse_skill_file(&content).is_err()
            })
            .collect();

        let reviewed_and_refused: Vec<&String> = refused
            .iter()
            .filter(|name| reviewed.contains_key(name.as_str()))
            .collect();
        assert!(
            reviewed_and_refused.is_empty(),
            "reviewed bundled skills no longer parse: {reviewed_and_refused:?}. These are ours; \
             fix the SKILL.md rather than the limit"
        );

        assert!(
            refused.len() <= REFUSED_CEILING,
            "{} bundled skills are refused by the parser, up from {REFUSED_CEILING}. The new ones \
             are shipped broken and reported as such in the skills list. Full set: {refused:?}",
            refused.len()
        );
    }

    /// `skill.view` truncates the runtime contract plus the body at
    /// LOADED_SKILL_BODY_MAX_CHARS. A bundled skill that overruns it loses its
    /// closing sections: ui-ux-pro-max arrived 568 characters over and its
    /// pre-delivery checklist never reached the model.
    ///
    /// Asserted for the reviewed skills, which are ours to restructure. The
    /// mirrored catalog overruns it in bulk, and its bodies are not ours to
    /// move into `references/`; what it loses is marked `[truncated]` in the
    /// loaded text (asserted in `loaded.rs`), so it is visible rather than
    /// silent.
    #[test]
    fn every_reviewed_bundled_skill_body_survives_the_load_limit() {
        use crate::core::agent::skills::loaded::LOADED_SKILL_BODY_MAX_CHARS;

        let source = bundled_skills_root();
        let reviewed = reviewed_platform_policy();
        let present = list_starter_skill_names(&source);

        for name in reviewed.keys() {
            assert!(
                present.contains(*name),
                "reviewed bundled skill `{name}` is no longer bundled"
            );
            let content = fs::read_to_string(source.join(name).join("SKILL.md")).unwrap();
            let parsed = parse_skill_file(&content).unwrap();
            // The contract `view` prepends is longest when scripts are declared;
            // 400 characters covers its wording plus the filenames it lists.
            let contract = 400 + parsed.manifest.requires_scripts.join(", ").chars().count();
            let total = contract + parsed.body.chars().count();
            assert!(
                total <= LOADED_SKILL_BODY_MAX_CHARS,
                "bundled skill `{name}` would be cut off when loaded: {total} characters against a \
                 limit of {LOADED_SKILL_BODY_MAX_CHARS}. Move late sections into references/."
            );
        }
    }
}
