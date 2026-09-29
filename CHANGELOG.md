# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.60] - 2026-09-23

### Features

- **Skills**: Ship the UI UX Pro Max design skills with Radium. This adds seven new skills (ui-ux-pro-max, design, design-system, ui-styling, brand, slides, banner-design) that provide design system knowledge, UI/UX guidelines, and styling capabilities. These skills are bundled with the application and will be available for review and activation in the skills folder.

### Bug Fixes

- **CI**: Resolve CI failures in PR #39 by fixing mypy type errors, adding None checks, and moving DevSkim comments to separate lines.
- **Web App**: Cancel the hub exact-repo debounce on unmount to prevent memory leaks.
- **Web App**: Stop CodeBlock from setting state after it unmounts to prevent React warnings.
- **Web App**: Guard the exact-repo fetch after its await, not just the timer.
- **Web App**: Let the newest exact-repo lookup win, not the slowest.
- **Build**: Pin aes to 0.9.2 to honour the declared 1.88 MSRV.
- **Build**: Clear the two Linux-only clippy errors.
- **Build**: Choose a crypto feature for the Linux credential store.
- **Build**: Pick a crypto feature for secret-service so Linux compiles.
- **Rust**: Clear the two -D warnings errors that block make verify.
- **Skills**: Silence DevSkim DS137138/DS162092 in logo test_generate.py.
- **Skills**: Silence DevSkim DS162092 on logo SSRF hostname guard.
- **Skills**: Silence DevSkim DS137138 in generate-slide.py.
- **Sidebar**: Route sidebar rail toggles through click handling.
- **Sidebar**: Make sidebar rail keyboard accessible.

### Chores

- **Version**: Bump version to 2.0.60.
- **Version**: Bump version to 2.0.55.
- **Tests**: Drop the patch artifacts and the broken 7th download argument.
- **Tests**: Fix ReplyModelGate download test race conditions.
- **Tests**: Fix CodeBlock teardown test.
- **Tests**: Cover code-block unmount teardown.
- **Tests**: Fix code-block highlight teardown race.
- **Tests**: Fix repository verification failures.
- **Guard**: Re-baseline the selective v2.0.32 protected surface.
- **Docs**: Record the secret-service crypto-backend choice (ADR).
- **Docs**: Correct the crypto-backend ADR's rejected-alternative reasoning.
- **Docs**: Document CodeBlock themes and async highlighting lifecycle.
- **Docs**: Stop the Cargo.toml comment contradicting its own ADR.
- **Docs**: Record the UI UX Pro Max port, its blockers and what is left.
- **CI**: Turn off super-linter's clippy, whose Cargo cannot read our lockfile.
- **CI**: Turn off super-linter's ts-standard, which cannot parse this repo.
- **CI**: Remove four starter workflows that cannot pass on this repository.
- **CI**: Allow generated extension lock updates during build.
- **CI**: Add authoritative Radium verification workflow.
- **AI Escalation**: Create ai-escalation.yml.
- **AI Escalation**: Update ai-escalation.yml.
- **Windows Build**: Update windows-test-build.yml.

### Breaking Changes

None in this release.