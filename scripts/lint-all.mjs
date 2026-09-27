#!/usr/bin/env node
// Runs eslint once per top-level src/ entry (each src/components/* subfolder
// counted separately) instead of one single invocation across every file.
//
// Why this exists: `eslint` (flat config, eslint-config-next, no type-aware
// linting — confirmed, parserOptions.project is never set anywhere in this
// project's config chain) reliably OOMs on this repo once given enough files
// in one process — confirmed by direct measurement: `src/app/**` (24 files)
// finishes in ~5s, but `src/components/**` (68 files) exceeds a 120s budget
// and eventually crashes with "JavaScript heap out of memory", even with
// --max-old-space-size raised to 8192 and given 20+ minutes to finish. Every
// individual src/components/<subfolder> (5-15 files each) lints cleanly in
// under 20s on its own — so this isn't one pathological file, it's ESLint's
// own memory accumulating across a large-enough file count within a single
// process (a known category of issue with ESLint v9 + typescript-eslint on
// larger codebases). Splitting the same total file set into several smaller
// invocations sidesteps it entirely without needing to track down exactly
// which plugin/rule leaks — each child process starts fresh and exits before
// accumulation becomes a problem.
//
// Update this list if src/'s own top-level shape changes (new top-level
// folder, or a components/ subfolder that itself grows past ~20 files and
// should be split further).
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";

function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Every top-level src/ entry becomes its own lint target, except
// components/, which is large enough on its own to reproduce the OOM — that
// one gets split one level deeper (src/components/<subfolder>) instead.
const targets = [];
for (const entry of readdirSync(SRC)) {
  const full = join(SRC, entry);
  if (!isDir(full)) continue;
  if (entry !== "components") {
    targets.push(full);
    continue;
  }
  for (const sub of readdirSync(full)) {
    const subFull = join(full, sub);
    if (isDir(subFull)) targets.push(subFull);
  }
}

// Non-directory top-level files eslint would otherwise also cover (e.g. a
// stray src/*.ts) — lint these together in one small extra pass.
const rootFiles = readdirSync(SRC).filter((entry) => !isDir(join(SRC, entry)));

console.log(`Linting ${targets.length} target(s) separately to avoid ESLint's own memory blowup on the full tree...\n`);

let failed = false;
for (const target of targets) {
  const pattern = `${target}/**/*.{ts,tsx}`;
  process.stdout.write(`  ${target} ... `);
  const result = spawnSync("npx", ["eslint", "--no-error-on-unmatched-pattern", pattern], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  if (result.status !== 0) {
    failed = true;
    console.log("FAILED");
    process.stdout.write(result.stdout?.toString() ?? "");
    process.stderr.write(result.stderr?.toString() ?? "");
  } else {
    console.log("ok");
  }
}

if (rootFiles.length > 0) {
  const patterns = rootFiles.map((f) => join(SRC, f));
  process.stdout.write(`  ${SRC}/* (root files) ... `);
  const result = spawnSync("npx", ["eslint", "--no-error-on-unmatched-pattern", ...patterns], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  if (result.status !== 0) {
    failed = true;
    console.log("FAILED");
    process.stdout.write(result.stdout?.toString() ?? "");
    process.stderr.write(result.stderr?.toString() ?? "");
  } else {
    console.log("ok");
  }
}

if (failed) {
  console.error("\nlint-all: one or more targets failed.");
  process.exit(1);
}
console.log("\nlint-all: all targets clean.");
