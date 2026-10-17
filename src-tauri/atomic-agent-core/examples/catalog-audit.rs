use std::{collections::BTreeMap, fs, path::PathBuf};
fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../resources/agent-skills");
    let mut failures = BTreeMap::<String, usize>::new();
    for entry in fs::read_dir(root).expect("catalog") {
        let path = entry.expect("entry").path().join("SKILL.md");
        if !path.is_file() {
            continue;
        }
        let content = fs::read_to_string(&path).expect("skill");
        let normalized = content.replace("\r\n", "\n");
        if let Some(frontmatter) = normalized
            .strip_prefix("---\n")
            .and_then(|rest| rest.split("\n---").next())
        {
            if let Ok(value) = serde_yaml::from_str::<serde_yaml::Value>(frontmatter) {
                if let Some(description) = value["description"].as_str() {
                    if description.chars().count() > 512 || description.contains('\n') {
                        println!(
                            "description {} {} {:?}",
                            path.display(),
                            description.chars().count(),
                            description
                        );
                    }
                }
            }
        }
        match atomic_agent_core::skills::parse_skill_file(&content) {
            Ok(parsed) => {
                if path
                    .parent()
                    .unwrap()
                    .file_name()
                    .unwrap()
                    .to_str()
                    .unwrap()
                    != parsed.manifest.name
                {
                    println!("identity {} -> {}", path.display(), parsed.manifest.name);
                }
                if parsed.body.chars().count() + 400
                    > atomic_agent_core::skills::loaded::LOADED_SKILL_BODY_MAX_CHARS
                {
                    println!(
                        "oversize {} {}",
                        parsed.manifest.name,
                        parsed.body.chars().count()
                    );
                }
            }
            Err(error) => {
                println!("{}: {error}", path.display());
                *failures.entry(error).or_default() += 1;
            }
        }
    }
    println!("Failures by diagnostic: {failures:#?}");
}
