//! How skills are arranged for people: who made each one, what kind of work
//! it is for, and its tags.
//!
//! None of this reaches the model. A skill's identity stays its `name`, and
//! everything here is display data for the skills page, derived in this
//! order (first hit wins):
//!
//! | Field    | Bundled skill                | Any skill                                                      | Last resort            |
//! | -------- | ---------------------------- | -------------------------------------------------------------- | ---------------------- |
//! | creator  | `_catalog.json` entry        | `metadata.creator`, `metadata.author`, `author`, `owner`        | `User` / `Unknown`     |
//! | category | `_catalog.json` entry        | `metadata.category`, then the category folder it sits in        | `Other`                |
//! | tags     | catalog tags + declared tags | `metadata.tags`, `tags`                                          | none                   |
//!
//! The bundled catalog wins for bundled skills because the mirrored NVIDIA set
//! uses `metadata.category` for its own taxonomy ("Conversion", "Analysis")
//! and must not be hand-edited, while the catalog maps every bundled skill
//! onto [`SKILL_CATEGORIES`].

use std::{collections::BTreeMap, fs, path::Path};

use serde::{Deserialize, Serialize};

/// The bundled catalog in `resources/agent-skills`. Discovery never treats it
/// as a skill: it is a file, and only folders are skills or categories.
pub const BUNDLED_CATALOG_FILE: &str = "_catalog.json";
/// Where seeding copies the catalog inside the data folder. Hidden like the
/// other state files so the data folder's own listing stays about skills.
pub const INSTALLED_CATALOG_FILE: &str = ".catalog.json";

/// The fixed category list the skills page groups by. A skill may declare a
/// category outside it; it is then shown under its own heading as written.
pub const SKILL_CATEGORIES: &[&str] = &[
    "Code & Dev",
    "AI & Machine Learning",
    "Data & Science",
    "Infrastructure & Hardware",
    "Robotics & Simulation",
    "Health & Life Sciences",
    "Graphics & Design",
    "Media",
    "Writing & Communication",
    "Productivity",
    "Other",
];

pub const OTHER_CATEGORY: &str = "Other";
pub const USER_CREATOR: &str = "User";
pub const UNKNOWN_CREATOR: &str = "Unknown";

const MAX_LABEL_CHARS: usize = 64;
const MAX_TAG_CHARS: usize = 40;
const MAX_TAGS: usize = 16;

/// Short spellings people are likely to write in `metadata.category` or use
/// as a folder name, mapped onto the fixed list. Compared after
/// [`category_key`], so case, spaces, `-`, `_` and `&`/`and` do not matter.
const CATEGORY_ALIASES: &[(&str, &str)] = &[
    ("code", "Code & Dev"),
    ("dev", "Code & Dev"),
    ("development", "Code & Dev"),
    ("coding", "Code & Dev"),
    ("programming", "Code & Dev"),
    ("software", "Code & Dev"),
    ("ai", "AI & Machine Learning"),
    ("ml", "AI & Machine Learning"),
    ("aiml", "AI & Machine Learning"),
    ("machinelearning", "AI & Machine Learning"),
    ("data", "Data & Science"),
    ("science", "Data & Science"),
    ("datascience", "Data & Science"),
    ("research", "Data & Science"),
    ("infrastructure", "Infrastructure & Hardware"),
    ("infra", "Infrastructure & Hardware"),
    ("hardware", "Infrastructure & Hardware"),
    ("devops", "Infrastructure & Hardware"),
    ("robotics", "Robotics & Simulation"),
    ("simulation", "Robotics & Simulation"),
    ("health", "Health & Life Sciences"),
    ("healthcare", "Health & Life Sciences"),
    ("medical", "Health & Life Sciences"),
    ("lifesciences", "Health & Life Sciences"),
    ("graphics", "Graphics & Design"),
    ("design", "Graphics & Design"),
    ("art", "Graphics & Design"),
    ("media", "Media"),
    ("audio", "Media"),
    ("video", "Media"),
    ("images", "Media"),
    ("writing", "Writing & Communication"),
    ("communication", "Writing & Communication"),
    ("docs", "Writing & Communication"),
    ("productivity", "Productivity"),
    ("other", "Other"),
    ("misc", "Other"),
];

/// Organizing hints a SKILL.md declares about itself. Read leniently: these
/// keys are free-form in third-party skills, so a value of the wrong shape is
/// ignored rather than failing the skill.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeclaredOrganization {
    pub creator: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
}

impl DeclaredOrganization {
    pub fn from_frontmatter(
        metadata: Option<&serde_yaml::Value>,
        author: Option<&serde_yaml::Value>,
        owner: Option<&serde_yaml::Value>,
        tags: Option<&serde_yaml::Value>,
    ) -> Self {
        let metadata = metadata.and_then(serde_yaml::Value::as_mapping);
        let field = |key: &str| metadata.and_then(|map| map.get(key));
        let creator = [field("creator"), field("author"), author, owner]
            .into_iter()
            .flatten()
            .find_map(clean_label);
        let category = field("category").and_then(clean_label);
        let mut declared_tags = Vec::new();
        for value in [field("tags"), tags].into_iter().flatten() {
            collect_tags(value, &mut declared_tags);
        }
        Self {
            creator,
            category,
            tags: declared_tags,
        }
    }
}

/// One bundled skill's entry in `_catalog.json`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct CatalogEntry {
    pub creator: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillCatalog {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub skills: BTreeMap<String, CatalogEntry>,
}

impl SkillCatalog {
    /// A missing or unreadable catalog only costs the bundled skills their
    /// curated creator and category; they fall back to what they declare.
    pub fn read(path: &Path) -> Self {
        let Ok(content) = fs::read_to_string(path) else {
            return Self::default();
        };
        match serde_json::from_str::<Self>(&content) {
            Ok(catalog) => catalog,
            Err(error) => {
                log::warn!(
                    "Ignoring invalid skills catalog {}: {error}",
                    path.display()
                );
                Self::default()
            }
        }
    }
}

/// Where a skill came from, for grouping by source.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    /// Shipped with Radium and re-installed by seeding.
    Bundled,
    /// Written, uploaded or copied in by the user.
    User,
}

/// The organizing data the skills page shows for one skill.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillOrganization {
    pub creator: String,
    pub category: String,
    pub tags: Vec<String>,
    pub source: SkillSource,
}

/// Apply the precedence documented at the top of this module.
pub fn resolve_organization(
    name: &str,
    reserved: bool,
    folder: &[String],
    declared: &DeclaredOrganization,
    catalog: &SkillCatalog,
) -> SkillOrganization {
    let source = if reserved {
        SkillSource::Bundled
    } else {
        SkillSource::User
    };
    let catalog_entry = reserved.then(|| catalog.skills.get(name)).flatten();
    let creator = catalog_entry
        .and_then(|entry| clean_str(&entry.creator))
        .or_else(|| declared.creator.as_deref().map(normalize_creator))
        .unwrap_or_else(|| {
            if reserved {
                UNKNOWN_CREATOR.to_string()
            } else {
                USER_CREATOR.to_string()
            }
        });
    let category = catalog_entry
        .and_then(|entry| clean_str(&entry.category))
        .map(|category| normalize_category(&category))
        .or_else(|| declared.category.as_deref().map(normalize_category))
        .or_else(|| folder.first().map(|folder| normalize_category(folder)))
        .unwrap_or_else(|| OTHER_CATEGORY.to_string());
    let mut tags = Vec::new();
    if let Some(entry) = catalog_entry {
        for tag in &entry.tags {
            push_tag(tag, &mut tags);
        }
    }
    for tag in &declared.tags {
        push_tag(tag, &mut tags);
    }
    SkillOrganization {
        creator,
        category,
        tags,
        source,
    }
}

/// Map a category onto [`SKILL_CATEGORIES`] when it names one (or a known
/// alias); otherwise keep the user's own wording, with `-`/`_` read as spaces
/// so a folder called `finance-tools` shows as "Finance tools".
pub fn normalize_category(value: &str) -> String {
    let key = category_key(value);
    if key.is_empty() {
        return OTHER_CATEGORY.to_string();
    }
    if let Some(known) = SKILL_CATEGORIES
        .iter()
        .find(|category| category_key(category) == key)
    {
        return (*known).to_string();
    }
    if let Some((_, known)) = CATEGORY_ALIASES.iter().find(|(alias, _)| *alias == key) {
        return (*known).to_string();
    }
    let spaced = value
        .trim()
        .chars()
        .map(|character| match character {
            '-' | '_' => ' ',
            other => other,
        })
        .collect::<String>();
    let spaced = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut characters = spaced.chars();
    match characters.next() {
        Some(first) => first.to_uppercase().chain(characters).collect(),
        None => OTHER_CATEGORY.to_string(),
    }
}

/// Collapse the many spellings of the big vendors so grouping by creator puts
/// "NVIDIA Corporation", "Jetson Team <...@nvidia.com>" and "NVIDIA" together.
/// Anything else keeps its wording, minus a trailing `<email>`.
pub fn normalize_creator(value: &str) -> String {
    let lowered = value.to_lowercase();
    if lowered.contains("nvidia") {
        return "NVIDIA".to_string();
    }
    if lowered.contains("anthropic") {
        return "Anthropic".to_string();
    }
    let tokens = words(value);
    if lowered.contains("x.ai") || tokens.iter().any(|word| word == "xai" || word == "grok") {
        return "xAI".to_string();
    }
    let without_email = match value.find('<') {
        Some(index) if value.trim_end().ends_with('>') => value[..index].trim(),
        _ => value.trim(),
    };
    clean_str(without_email).unwrap_or_else(|| UNKNOWN_CREATOR.to_string())
}

fn category_key(value: &str) -> String {
    words(value)
        .into_iter()
        .filter(|word| word != "and")
        .collect::<String>()
}

fn words(value: &str) -> Vec<String> {
    value
        .to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

fn clean_label(value: &serde_yaml::Value) -> Option<String> {
    value.as_str().and_then(clean_str)
}

/// One display line: no control characters, trimmed, bounded.
fn clean_str(value: &str) -> Option<String> {
    let cleaned = value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.chars().take(MAX_LABEL_CHARS).collect())
    }
}

fn collect_tags(value: &serde_yaml::Value, tags: &mut Vec<String>) {
    match value {
        serde_yaml::Value::Sequence(values) => {
            for value in values {
                if let Some(tag) = value.as_str() {
                    push_tag(tag, tags);
                }
            }
        }
        // `tags: a, b` is a common hand-written shape.
        serde_yaml::Value::String(value) => {
            for tag in value.split(',') {
                push_tag(tag, tags);
            }
        }
        _ => {}
    }
}

fn push_tag(tag: &str, tags: &mut Vec<String>) {
    if tags.len() >= MAX_TAGS {
        return;
    }
    let Some(tag) = clean_str(tag) else {
        return;
    };
    let tag = tag.chars().take(MAX_TAG_CHARS).collect::<String>();
    if !tags
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&tag))
    {
        tags.push(tag);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn yaml(text: &str) -> serde_yaml::Value {
        serde_yaml::from_str(text).unwrap()
    }

    #[test]
    fn categories_match_the_fixed_list_by_name_or_alias() {
        assert_eq!(
            normalize_category("graphics-and-design"),
            "Graphics & Design"
        );
        assert_eq!(normalize_category("Graphics & Design"), "Graphics & Design");
        assert_eq!(normalize_category("code"), "Code & Dev");
        assert_eq!(normalize_category("WRITING"), "Writing & Communication");
        assert_eq!(
            normalize_category("ai-and-machine-learning"),
            "AI & Machine Learning"
        );
        assert_eq!(normalize_category("finance_tools"), "Finance tools");
        assert_eq!(normalize_category("  "), OTHER_CATEGORY);
    }

    #[test]
    fn creators_collapse_vendor_spellings_and_drop_emails() {
        assert_eq!(
            normalize_creator("Jetson Team <jetson@nvidia.com>"),
            "NVIDIA"
        );
        assert_eq!(
            normalize_creator("NVIDIA Corporation and Affiliates"),
            "NVIDIA"
        );
        assert_eq!(normalize_creator("Anthropic, PBC"), "Anthropic");
        assert_eq!(normalize_creator("xAI"), "xAI");
        assert_eq!(normalize_creator("Grok"), "xAI");
        assert_eq!(
            normalize_creator("Ada Lovelace <ada@example.com>"),
            "Ada Lovelace"
        );
    }

    #[test]
    fn declared_organization_reads_metadata_leniently() {
        let metadata =
            yaml("{creator: Ada, author: Someone Else, category: design, tags: [a, b, A]}");
        let declared = DeclaredOrganization::from_frontmatter(Some(&metadata), None, None, None);
        assert_eq!(declared.creator.as_deref(), Some("Ada"));
        assert_eq!(declared.category.as_deref(), Some("design"));
        assert_eq!(declared.tags, ["a", "b"]);

        // Wrong shapes are ignored, never fatal.
        let odd = yaml("{author: [1, 2], category: 3, tags: {x: y}}");
        let declared = DeclaredOrganization::from_frontmatter(
            Some(&odd),
            Some(&yaml("Top Author")),
            None,
            Some(&yaml("one, two")),
        );
        assert_eq!(declared.creator.as_deref(), Some("Top Author"));
        assert_eq!(declared.category, None);
        assert_eq!(declared.tags, ["one", "two"]);
    }

    #[test]
    fn precedence_is_catalog_then_declared_then_folder_then_fallback() {
        let catalog = SkillCatalog {
            version: 1,
            skills: BTreeMap::from([(
                "bundled".to_string(),
                CatalogEntry {
                    creator: "NVIDIA".into(),
                    category: "Data & Science".into(),
                    tags: vec!["cuopt".into()],
                },
            )]),
        };
        let declared = DeclaredOrganization {
            creator: Some("NVIDIA cuOpt Team".into()),
            category: Some("Optimization".into()),
            tags: vec!["solver".into()],
        };

        let bundled = resolve_organization("bundled", true, &[], &declared, &catalog);
        assert_eq!(bundled.creator, "NVIDIA");
        assert_eq!(bundled.category, "Data & Science");
        assert_eq!(bundled.tags, ["cuopt", "solver"]);
        assert_eq!(bundled.source, SkillSource::Bundled);

        // The catalog only speaks for bundled skills.
        let user = resolve_organization("bundled", false, &[], &declared, &catalog);
        assert_eq!(user.creator, "NVIDIA");
        assert_eq!(user.category, "Optimization");
        assert_eq!(user.source, SkillSource::User);

        let folder = vec!["graphics".to_string(), "logos".to_string()];
        let nested = resolve_organization(
            "mine",
            false,
            &folder,
            &DeclaredOrganization::default(),
            &catalog,
        );
        assert_eq!(nested.creator, USER_CREATOR);
        assert_eq!(nested.category, "Graphics & Design");

        let bare = resolve_organization(
            "unlisted-bundled",
            true,
            &[],
            &DeclaredOrganization::default(),
            &catalog,
        );
        assert_eq!(bare.creator, UNKNOWN_CREATOR);
        assert_eq!(bare.category, OTHER_CATEGORY);
    }
}
