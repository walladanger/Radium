---
date: 2026-10-16
title: Pin standalone controller and core build resolutions
---

# Pin standalone controller and core build resolutions

- **Context:** The agent core and controller are independent Cargo workspaces.
  The repository's default ignore rule omitted their generated lockfiles. A
  fresh offline controller resolution refused an existing dependency version
  after it was yanked, although the same version remained in the desktop's
  committed lockfile. Desktop and standalone builds therefore behaved differently.
- **Decision:** Commit the standalone lockfiles used by the passing core and
  controller suites. Their Makefile test and Clippy targets use `--locked`, so
  a clean checkout reproduces those tested resolutions and manifest changes
  require a deliberate lockfile update. Add no new runtime dependency.
- **Consequences:** Dependency updates remain explicit and reviewable. Pinning
  is reproducibility, not a claim that inherited dependencies have no security
  advisories; upgrades must still be assessed and tested. The standalone projects
  remain independent of the desktop's platform dependencies.
- **Owner:** team.
