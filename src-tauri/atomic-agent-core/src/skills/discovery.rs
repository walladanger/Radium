//! Finding skill folders under a skills root, flat or nested.
//!
//! Layout rules, for the bundled set and the data folder alike:
//!
//! - A folder that contains `SKILL.md` is a skill. Its folder name is its
//!   identity (it must equal the manifest `name`), wherever it sits.
//! - A folder without `SKILL.md` is a category and is searched in turn, at
//!   most [`MAX_CATEGORY_DEPTH`] levels deep:
//!   `agent-skills/<category>/<sub-category>/<skill>/SKILL.md`.
//! - Nothing inside a skill folder is searched for more skills, so a skill's
//!   own `references/` or `examples/` never turn into skills.
//! - Names starting with `.` are skipped (state files, seeding temporaries),
//!   and so is everything that is not a real directory: files such as
//!   `README.md` or `_catalog.json`, and symbolic links. A folder whose
//!   resolved path leaves its parent (a Windows junction) is reported.
//!
//! Today's flat layout is simply the case with no categories.

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

/// How many category folders may enclose a skill.
pub const MAX_CATEGORY_DEPTH: usize = 3;

/// A folder that holds a `SKILL.md`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveredSkill {
    /// The folder's own name: the skill's identity.
    pub folder_name: String,
    /// `root.join(folder.join("/")).join(folder_name)`, not canonicalized.
    pub path: PathBuf,
    /// The category folders between the root and the skill, outermost first.
    pub folder: Vec<String>,
}

impl DiscoveredSkill {
    /// The skill's path below the root with `/` separators, e.g.
    /// `graphics/logo-maker` or plain `logo-maker`.
    pub fn relative_path(&self) -> String {
        relative_path(&self.folder, &self.folder_name)
    }
}

/// A folder discovery could not use, reported instead of dropped.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryProblem {
    pub folder_name: String,
    pub folder: Vec<String>,
    pub error: String,
}

#[derive(Debug, Default)]
pub struct Discovery {
    pub skills: Vec<DiscoveredSkill>,
    pub problems: Vec<DiscoveryProblem>,
}

pub fn relative_path(folder: &[String], name: &str) -> String {
    folder
        .iter()
        .map(String::as_str)
        .chain(std::iter::once(name))
        .collect::<Vec<_>>()
        .join("/")
}

/// Every skill folder under `root`. Shallower skills come first, then by
/// path, so when two folders share a name the one nearer the root wins and
/// that choice does not depend on directory listing order.
pub fn discover_skill_folders(root: &Path) -> Result<Discovery, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve agent skills directory: {error}"))?;
    let mut discovery = Discovery::default();
    walk(root, &canonical_root, &[], &mut discovery, true)?;
    discovery.skills.sort_by(|left, right| {
        left.folder
            .len()
            .cmp(&right.folder.len())
            .then_with(|| left.relative_path().cmp(&right.relative_path()))
    });
    Ok(discovery)
}

fn walk(
    directory: &Path,
    canonical_directory: &Path,
    folder: &[String],
    discovery: &mut Discovery,
    is_root: bool,
) -> Result<(), String> {
    let listing = match fs::read_dir(directory) {
        Ok(listing) => listing,
        Err(error) if is_root => {
            return Err(format!("Failed to scan agent skills directory: {error}"))
        }
        Err(error) => {
            discovery.problems.push(problem_for(
                folder,
                format!("Failed to scan category folder: {error}"),
            ));
            return Ok(());
        }
    };
    let mut entries = listing.filter_map(Result::ok).collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let folder_name = entry.file_name().to_string_lossy().to_string();
        if folder_name.starts_with('.') {
            continue;
        }
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                discovery.problems.push(DiscoveryProblem {
                    folder_name,
                    folder: folder.to_vec(),
                    error: format!("Failed to inspect skill directory: {error}"),
                });
                continue;
            }
        };
        if !file_type.is_dir() {
            continue;
        }
        let path = entry.path();
        let canonical = match path.canonicalize() {
            Ok(canonical) if canonical.parent() == Some(canonical_directory) => canonical,
            Ok(_) => {
                discovery.problems.push(DiscoveryProblem {
                    folder_name,
                    folder: folder.to_vec(),
                    error: "Skill directory resolves outside the global skills root".to_string(),
                });
                continue;
            }
            Err(error) => {
                discovery.problems.push(DiscoveryProblem {
                    folder_name,
                    folder: folder.to_vec(),
                    error: format!("Failed to resolve skill directory: {error}"),
                });
                continue;
            }
        };
        if holds_skill_manifest(&path) {
            discovery.skills.push(DiscoveredSkill {
                folder_name,
                path,
                folder: folder.to_vec(),
            });
            continue;
        }
        let mut nested = folder.to_vec();
        nested.push(folder_name.clone());
        if folder.len() >= MAX_CATEGORY_DEPTH {
            if !is_empty_directory(&path) {
                discovery.problems.push(DiscoveryProblem {
                    folder_name,
                    folder: folder.to_vec(),
                    error: format!(
                        "No SKILL.md found, and category folders may only be nested {MAX_CATEGORY_DEPTH} levels deep"
                    ),
                });
            }
            continue;
        }
        let before = discovery.skills.len() + discovery.problems.len();
        walk(&path, &canonical, &nested, discovery, false)?;
        let found_nothing = discovery.skills.len() + discovery.problems.len() == before;
        // A folder of plain files with no sub-folders is a skill that lost
        // (or misspelled) its SKILL.md, not a category. Say so rather than
        // letting it vanish from the list.
        if found_nothing && looks_like_a_skill_without_manifest(&path) {
            discovery.problems.push(DiscoveryProblem {
                folder_name,
                folder: folder.to_vec(),
                error: "No SKILL.md found. A folder without SKILL.md is read as a category; \
                        add SKILL.md (exactly that name) to make it a skill"
                    .to_string(),
            });
        }
    }
    Ok(())
}

/// `SKILL.md` exists in any form. Whether it is a usable regular file is the
/// registry's call, so a symlinked or unreadable manifest is still reported
/// against the skill rather than turning its folder into a category.
fn holds_skill_manifest(directory: &Path) -> bool {
    match fs::symlink_metadata(directory.join("SKILL.md")) {
        Ok(_) => true,
        Err(error) => error.kind() != ErrorKind::NotFound,
    }
}

fn is_empty_directory(directory: &Path) -> bool {
    fs::read_dir(directory)
        .map(|mut listing| listing.next().is_none())
        .unwrap_or(true)
}

fn looks_like_a_skill_without_manifest(directory: &Path) -> bool {
    let Ok(listing) = fs::read_dir(directory) else {
        return false;
    };
    let mut has_file = false;
    for entry in listing.filter_map(Result::ok) {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        match entry.file_type() {
            Ok(file_type) if file_type.is_dir() => return false,
            Ok(_) => has_file = true,
            Err(_) => {}
        }
    }
    has_file
}

fn problem_for(folder: &[String], error: String) -> DiscoveryProblem {
    let (folder_name, parent) = folder
        .split_last()
        .map(|(last, parent)| (last.clone(), parent.to_vec()))
        .unwrap_or_default();
    DiscoveryProblem {
        folder_name,
        folder: parent,
        error,
    }
}

/// Total bytes and file count of a folder, without following links. Used for
/// skills that failed to load, which therefore have no fingerprint pass.
pub fn folder_size(directory: &Path) -> (u64, usize) {
    let mut bytes = 0u64;
    let mut files = 0usize;
    let mut pending = vec![directory.to_path_buf()];
    while let Some(current) = pending.pop() {
        let Ok(listing) = fs::read_dir(&current) else {
            continue;
        };
        for entry in listing.filter_map(Result::ok) {
            let Ok(metadata) = fs::symlink_metadata(entry.path()) else {
                continue;
            };
            if metadata.is_dir() {
                pending.push(entry.path());
            } else {
                files += 1;
                if metadata.is_file() {
                    bytes = bytes.saturating_add(metadata.len());
                }
            }
        }
    }
    (bytes, files)
}

/// Check a user-supplied category path ("graphics" or "graphics/logos") and
/// split it into folder names. Empty means the root.
pub fn parse_category_path(value: &str) -> Result<Vec<String>, String> {
    let trimmed = value.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let parts = trimmed
        .split('/')
        .map(str::trim)
        .map(str::to_string)
        .collect::<Vec<_>>();
    if parts.len() > MAX_CATEGORY_DEPTH {
        return Err(format!(
            "Category folders may only be nested {MAX_CATEGORY_DEPTH} levels deep"
        ));
    }
    for part in &parts {
        let valid = !part.is_empty()
            && part.chars().count() <= 64
            && !part.starts_with('.')
            && part != ".."
            && !part.chars().any(|character| {
                character.is_control()
                    || matches!(character, '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
            })
            && !part.ends_with(' ')
            && !part.ends_with('.');
        if !valid {
            return Err(format!(
                "`{part}` is not a usable folder name: use letters, numbers, spaces, `-` or `_`, \
                 at most 64 characters, not starting with `.`"
            ));
        }
    }
    Ok(parts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn skill(root: &Path, relative: &str) {
        let directory = root.join(relative);
        fs::create_dir_all(&directory).unwrap();
        let name = directory.file_name().unwrap().to_string_lossy().to_string();
        fs::write(
            directory.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Test\n---\nBody"),
        )
        .unwrap();
    }

    fn paths(discovery: &Discovery) -> Vec<String> {
        discovery
            .skills
            .iter()
            .map(DiscoveredSkill::relative_path)
            .collect()
    }

    #[test]
    fn finds_flat_and_nested_skills_shallowest_first() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        skill(root, "flat-skill");
        skill(root, "graphics/logo-maker");
        skill(root, "code/rust/cargo-helper");
        skill(root, "a/b/c/deepest");
        // A skill's own sub-folders are never searched for more skills.
        skill(root, "flat-skill/examples/not-a-skill");
        fs::write(root.join("_catalog.json"), "{}").unwrap();
        fs::write(root.join("README.md"), "readme").unwrap();
        fs::create_dir_all(root.join(".flat-skill.seed-tmp")).unwrap();

        let discovery = discover_skill_folders(root).unwrap();

        assert_eq!(
            paths(&discovery),
            [
                "flat-skill",
                "graphics/logo-maker",
                "code/rust/cargo-helper",
                "a/b/c/deepest"
            ]
        );
        assert!(discovery.problems.is_empty(), "{:?}", discovery.problems);
        let nested = &discovery.skills[2];
        assert_eq!(nested.folder_name, "cargo-helper");
        assert_eq!(nested.folder, ["code", "rust"]);
    }

    #[test]
    fn stops_at_the_depth_limit_and_says_so() {
        let temp = TempDir::new().unwrap();
        skill(temp.path(), "a/b/c/d/too-deep");

        let discovery = discover_skill_folders(temp.path()).unwrap();

        assert!(discovery.skills.is_empty());
        assert_eq!(discovery.problems.len(), 1);
        assert_eq!(discovery.problems[0].folder_name, "d");
        assert_eq!(discovery.problems[0].folder, ["a", "b", "c"]);
        assert!(discovery.problems[0].error.contains("nested"));
    }

    #[test]
    fn reports_a_folder_that_lost_its_manifest_but_not_an_empty_category() {
        let temp = TempDir::new().unwrap();
        let root = temp.path();
        fs::create_dir_all(root.join("misspelled")).unwrap();
        fs::write(root.join("misspelled/skill.MD"), "x").unwrap();
        fs::create_dir_all(root.join("empty-category")).unwrap();

        let discovery = discover_skill_folders(root).unwrap();

        assert!(discovery.skills.is_empty());
        assert_eq!(discovery.problems.len(), 1);
        assert_eq!(discovery.problems[0].folder_name, "misspelled");
        assert!(discovery.problems[0].error.contains("No SKILL.md"));
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_symlinked_folders() {
        use std::os::unix::fs::symlink;

        let temp = TempDir::new().unwrap();
        let root = temp.path().join("skills");
        fs::create_dir_all(&root).unwrap();
        skill(temp.path(), "outside/escaped");
        symlink(temp.path().join("outside"), root.join("linked-category")).unwrap();

        let discovery = discover_skill_folders(&root).unwrap();

        assert!(discovery.skills.is_empty());
    }

    #[test]
    fn counts_folder_size() {
        let temp = TempDir::new().unwrap();
        fs::create_dir_all(temp.path().join("a/b")).unwrap();
        fs::write(temp.path().join("a/one.txt"), "12345").unwrap();
        fs::write(temp.path().join("a/b/two.txt"), "123").unwrap();
        assert_eq!(folder_size(&temp.path().join("a")), (8, 2));
    }

    #[test]
    fn category_paths_are_checked() {
        assert_eq!(parse_category_path("").unwrap(), Vec::<String>::new());
        assert_eq!(
            parse_category_path("/graphics/logos/").unwrap(),
            ["graphics", "logos"]
        );
        assert!(parse_category_path("../escape").is_err());
        assert!(parse_category_path("a/../b").is_err());
        assert!(parse_category_path(".hidden").is_err());
        assert!(parse_category_path("a\\b").is_err());
        assert!(parse_category_path("a/b/c/d").is_err());
        assert!(parse_category_path("a//b").is_err());
    }
}
