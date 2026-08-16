// Builds the MCPB bundle Smithery distributes for local (stdio) installation:
//
//   node scripts/build-mcpb.mjs        # writes freehire-<version>.mcpb in the repo root
//
// The bundle has to run without an install step, so it carries the compiled server
// plus its production dependencies — hence the staging directory rather than packing
// the repo, which would ship vitest and typescript to every user.
//
// Version and description are injected from package.json instead of being written into
// mcpb-manifest.json. They are already stated in package.json and server.json; a third
// hand-kept copy is a third thing to forget on release day.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stage = join(root, ".mcpb-build");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "mcpb-manifest.json"), "utf8"));

manifest.version = pkg.version;
manifest.description = pkg.description;

console.log(`building freehire-${pkg.version}.mcpb`);

rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "server"), { recursive: true });

execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
cpSync(join(root, "dist"), join(stage, "server"), { recursive: true });

// A package.json with production dependencies only — npm resolves the install from it.
writeFileSync(
  join(stage, "package.json"),
  JSON.stringify(
    { name: pkg.name, version: pkg.version, type: "module", dependencies: pkg.dependencies },
    null,
    2,
  ),
);
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
cpSync(join(root, "assets", "icon.png"), join(stage, "icon.png"));

execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: stage,
  stdio: "inherit",
});

execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "pack", ".", join(root, `freehire-${pkg.version}.mcpb`)], {
  cwd: stage,
  stdio: "inherit",
});

rmSync(stage, { recursive: true, force: true });
