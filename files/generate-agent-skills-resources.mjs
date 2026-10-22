#!/usr/bin/env node
// Regenerate the `resources/agent-skills/**` list used by Tauri `bundle.resources`.
//
// Tauri v2 resource globs (`glob` 0.3.4) cannot express "everything except
// tests/", and the `tests/` fixtures push the Windows NSIS/MSI installers past
// MAX_PATH (260). So the bundle lists the agent-skills tree explicitly, omitting
// any path component named `tests`.
//
// Rules (the source of truth for what `apply-agent-skills-resources.mjs` writes):
//   * a directory whose subtree contains no `tests` component is emitted as a
//     single bare-directory entry (Tauri walks it recursively);
//   * a directory whose subtree does contain `tests` is expanded: files are
//     emitted individually and non-`tests` subdirectories recurse;
//   * the final list is sorted byte-wise (UTF-16 code units), i.e. a flat sort
//     of every emitted entry.
//
// Run directly (`node files/generate-agent-skills-resources.mjs`) to print the
// JSON array to stdout. See
// docs/decisions/2026-10-14-exclude-agent-skills-tests-from-windows-bundle-for-max-path.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_COMPONENT = 'tests';
const RESOURCE_PREFIX = 'resources/agent-skills';
const MAX_RESOURCE_LENGTH = 250;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const agentSkillsDir = path.join(repoRoot, 'src-tauri', 'resources', 'agent-skills');

function resourcePath(relative) {
  return relative === '' ? RESOURCE_PREFIX : `${RESOURCE_PREFIX}/${relative}`;
}

/** True if `absDir` or any descendant directory has a path component named `tests`. */
function subtreeHasTests(absDir) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === TESTS_COMPONENT) return true;
    if (entry.isDirectory() && subtreeHasTests(path.join(absDir, entry.name))) return true;
  }
  return false;
}

function collect(absDir, relative, out) {
  if (!subtreeHasTests(absDir)) {
    out.push(resourcePath(relative));
    return;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === TESTS_COMPONENT) continue;
    const childAbs = path.join(absDir, entry.name);
    const childRel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      collect(childAbs, childRel, out);
    } else if (entry.isFile()) {
      out.push(resourcePath(childRel));
    } else {
      throw new Error(`Unexpected entry type in agent-skills tree: ${childAbs}`);
    }
  }
}

function validate(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (entry.split('/').includes(TESTS_COMPONENT)) {
      throw new Error(`generated resource contains a '${TESTS_COMPONENT}' component: ${entry}`);
    }
    if (entry.length > MAX_RESOURCE_LENGTH) {
      throw new Error(
        `generated resource is ${entry.length} chars (max ${MAX_RESOURCE_LENGTH}): ${entry}`,
      );
    }
    if (seen.has(entry)) {
      throw new Error(`duplicate generated resource: ${entry}`);
    }
    seen.add(entry);
  }
}

export function generateAgentSkillsResources() {
  if (!fs.existsSync(agentSkillsDir) || !fs.statSync(agentSkillsDir).isDirectory()) {
    throw new Error(`agent-skills directory not found: ${agentSkillsDir}`);
  }
  const entries = [];
  collect(agentSkillsDir, '', entries);
  entries.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  validate(entries);
  return entries;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const entries = generateAgentSkillsResources();
  process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
}
