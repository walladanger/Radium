# Anthropic Agent Skills (bundled)

The following bundled skills come from [anthropics/skills](https://github.com/anthropics/skills)
at commit `683bc88e56f3e09ba94f7055977f3d3aa499f202` and are licensed under the
Apache License 2.0 (see each skill's `LICENSE.txt`). Third-party components used by
some of them are listed in [`ANTHROPIC_THIRD_PARTY_NOTICES.md`](ANTHROPIC_THIRD_PARTY_NOTICES.md).

academy-guide, algorithmic-art, brand-guidelines, canvas-design, claude-api,
discernment-nudge, doc-coauthoring, frontend-design, internal-comms, mcp-builder,
anthropic-skill-creator, slack-gif-creator, theme-factory, web-artifacts-builder,
webapp-testing.

Anthropic's source-available document skills (`docx`, `pdf`, `pptx`, `xlsx`) are
**not** included; their license does not permit redistribution.

## Modifications (Apache-2.0 §4(b))

- `anthropic-skill-creator/` is Anthropic's `skill-creator`, renamed (folder and
  `name:` frontmatter) so it does not replace Radium's own bundled `skill-creator`.
- `academy-guide/SKILL.md`, `claude-api/SKILL.md`, `discernment-nudge/SKILL.md`:
  the frontmatter `description` was condensed to a single line of at most 512
  characters, the limit Radium's skill manifest parser enforces
  (`src-tauri/src/core/agent/skills/manifest.rs`). Skill bodies are unchanged.

All other files are unmodified.
