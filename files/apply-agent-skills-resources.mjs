#!/usr/bin/env node
// Rewrite the `bundle.resources` arrays in the two Tauri config files so their
// `resources/agent-skills/*` run matches the generated list (see
// generate-agent-skills-resources.mjs). Only the contiguous agent-skills run is
// rewritten; every other line is preserved byte-for-byte (the Windows config is
// formatted with inline short arrays, so a JSON round-trip would churn it).
//
// Pass `--check` to exit non-zero if either config is out of date, without
// writing anything (for CI). Otherwise both files are rewritten in place.
//
// See docs/decisions/2026-10-14-exclude-agent-skills-tests-from-windows-bundle-for-max-path.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAgentSkillsResources } from './generate-agent-skills-resources.mjs';

const AGENT_SKILLS_PREFIX = 'resources/agent-skills/';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const configFiles = [
  path.join(repoRoot, 'src-tauri', 'tauri.conf.json'),
  path.join(repoRoot, 'src-tauri', 'tauri.windows.conf.json'),
];

function currentAgentSkills(config) {
  return config.bundle.resources.filter((entry) => entry.startsWith(AGENT_SKILLS_PREFIX));
}

function isUpToDate(config, generated) {
  const current = currentAgentSkills(config);
  return (
    current.length === generated.length && current.every((entry, i) => entry === generated[i])
  );
}

function rewrite(file, config, generated) {
  const resources = config.bundle.resources;
  const first = resources.findIndex((entry) => entry.startsWith(AGENT_SKILLS_PREFIX));
  if (first === -1) {
    throw new Error(`${file}: no '${AGENT_SKILLS_PREFIX}' entries found`);
  }
  let last = first;
  while (last < resources.length && resources[last].startsWith(AGENT_SKILLS_PREFIX)) {
    last += 1;
  }

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // `resources` is one flat string entry per line; map each entry's array index
  // to its line number so only the agent-skills run is touched.
  const openLine = lines.findIndex((line) => line.trim() === '"resources": [');
  if (openLine === -1) {
    throw new Error(`${file}: 'resources' array not found`);
  }
  const firstLine = openLine + 1 + first;
  const lastLine = openLine + 1 + last; // first line after the run
  const indent = (lines[firstLine].match(/^\s*/) || [''])[0];

  const hasFollowing = last < resources.length;
  const generatedLines = generated.map((entry, i) => {
    const comma = hasFollowing || i < generated.length - 1 ? ',' : '';
    return `${indent}${JSON.stringify(entry)}${comma}`;
  });

  const updated = lines.slice(0, firstLine).concat(generatedLines, lines.slice(lastLine));
  fs.writeFileSync(file, updated.join('\n'));
}

const checkOnly = process.argv.includes('--check');
const generated = generateAgentSkillsResources();
let failed = false;

for (const file of configFiles) {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (checkOnly) {
    if (!isUpToDate(config, generated)) {
      failed = true;
      console.error(
        `${file}: agent-skills resources out of date (${currentAgentSkills(config).length} entries, expected ${generated.length}); run node files/apply-agent-skills-resources.mjs`,
      );
    }
  } else {
    rewrite(file, config, generated);
    console.log(
      `${path.relative(repoRoot, file)}: wrote ${generated.length} agent-skills resources`,
    );
  }
}

if (failed) process.exit(1);
