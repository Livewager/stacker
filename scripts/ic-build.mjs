#!/usr/bin/env node
/**
 * IC static-export build wrapper.
 *
 * Next.js `output: "export"` rejects any dynamic route handler:
 *   - src/app/api/**           (LTC + waitlist endpoints)
 *   - src/app/robots.ts        (dynamic robots.txt handler)
 *   - src/app/manifest.ts      (dynamic webmanifest handler)
 *   - src/app/opengraph-image.tsx (dynamic OG image handler)
 *
 * Those are all Vercel-production-only in this repo. The IC build
 * path stashes each one before `next build`, then restores them
 * afterward — even on failure, via a try/finally — so a crashed
 * build doesn't leave half-renamed files on disk.
 *
 * Output lands in `out/` which is what dfx.json's stacker_frontend
 * canister serves.
 */

import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL(".", import.meta.url).pathname, "..");

const STASHES = [
  {
    live: resolve(root, "src/app/api"),
    stash: resolve(root, "src/app/__api_ic_stash__"),
    label: "api/",
  },
  {
    live: resolve(root, "src/app/robots.ts"),
    stash: resolve(root, "src/app/robots.ts.ic-stash"),
    label: "robots.ts",
  },
  {
    live: resolve(root, "src/app/manifest.ts"),
    stash: resolve(root, "src/app/manifest.ts.ic-stash"),
    label: "manifest.ts",
  },
  {
    live: resolve(root, "src/app/opengraph-image.tsx"),
    stash: resolve(root, "src/app/opengraph-image.tsx.ic-stash"),
    label: "opengraph-image.tsx",
  },
];

const renamed = [];
try {
  for (const entry of STASHES) {
    if (existsSync(entry.live)) {
      renameSync(entry.live, entry.stash);
      renamed.push(entry);
      console.log(`[ic-build] stashed ${entry.label}`);
    }
  }
  execSync("IC_BUILD=1 next build", {
    stdio: "inherit",
    env: { ...process.env, IC_BUILD: "1" },
    cwd: root,
  });
} finally {
  for (const entry of renamed) {
    if (existsSync(entry.stash)) {
      renameSync(entry.stash, entry.live);
      console.log(`[ic-build] restored ${entry.label}`);
    }
  }
}
