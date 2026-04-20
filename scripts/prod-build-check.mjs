#!/usr/bin/env node
/**
 * Production build green-check (POLISH-202).
 *
 * Runs `next build` and fails the process if:
 *   1. the build exits non-zero
 *   2. stderr contains unexpected warning lines
 *
 * An allow-list captures known-good noise: the one `⚠ Using edge
 * runtime on a page currently disables static generation` line that
 * our /dunk/opengraph-image route produces by design, plus the
 * Next.js experimental-API notice they emit when you opt into an
 * experimental flag. Anything else surfaces as a failure with the
 * offending lines printed, so a new dependency or config that starts
 * emitting a warning has to pass through this check or get explicitly
 * allow-listed here — keeps the baseline honest.
 *
 * Usage:
 *   node scripts/prod-build-check.mjs
 *   npm run build:check
 *
 * Exits 0 on green, non-zero on any unexpected warning or a build
 * failure. The dev server is left alone (this spawns its own `next
 * build` in the same working directory — safe to run while `npm run
 * dev` is active on port 3002).
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");

// Lines we tolerate verbatim. Substring match (case-insensitive).
// Keep this list short and justify each entry — everything else is
// signal we want to notice.
const ALLOW = [
  // Intentional: /dunk/opengraph-image is an edge runtime to use
  // next/og. Next 15 emits one warn per edge route.
  "using edge runtime on a page currently disables static generation",
  // Benign in our setup — Next surfaces it whenever you opt into an
  // experimental flag. We opt into none today, but leaving this in
  // reduces false alarms if a flag is ever enabled.
  "experimental feature",
];

const build = spawn("npx", ["next", "build"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
build.stdout.on("data", (chunk) => {
  const s = chunk.toString();
  stdout += s;
  process.stdout.write(s);
});
build.stderr.on("data", (chunk) => {
  const s = chunk.toString();
  stderr += s;
  process.stderr.write(s);
});

build.on("exit", (code) => {
  if (code !== 0) {
    console.error(`\n[prod-build-check] FAIL — next build exited ${code}`);
    process.exit(code ?? 1);
  }

  // Scan both streams since Next fans some warnings to stdout and
  // others to stderr depending on severity.
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split("\n");
  const warnings = lines.filter((l) => /\bwarn(ing)?\b|⚠/i.test(l));
  const unexpected = warnings.filter((l) => {
    const lower = l.toLowerCase();
    return !ALLOW.some((a) => lower.includes(a));
  });

  if (unexpected.length > 0) {
    console.error(
      `\n[prod-build-check] FAIL — ${unexpected.length} unexpected warning line(s):`,
    );
    for (const line of unexpected) console.error(`  ${line.trim()}`);
    console.error(
      `\nEither fix the underlying issue, or, if the warning is benign, add a substring to ALLOW in scripts/prod-build-check.mjs with a justification.`,
    );
    process.exit(1);
  }

  console.log(
    `\n[prod-build-check] PASS — build exited 0, ${warnings.length} allow-listed warning(s).`,
  );
  process.exit(0);
});
