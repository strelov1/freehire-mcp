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
// hand-kept copy is a third thing to forget on release day. The tool list is read from
// the built server for the same reason — see readToolsFromServer below.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Asks the built server for its own tool list over stdio.
 *
 * The manifest has to carry the tools or the directory scores the server at zero on
 * capability — but writing 23 of them out by hand would be a copy of what tools.ts
 * already declares, stale by the next release. So: start the server, speak MCP at it,
 * and take the answer. No token is needed; tools/list does not touch the API.
 *
 * Note the shape. Smithery validates each entry as an object and rejects the
 * `{name, description}` form the MCPB spec permits, so pass what the server gives —
 * inputSchema and annotations included. */
function readToolsFromServer(entry) {
  const request = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "build-mcpb", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]
    .map((m) => JSON.stringify(m))
    .join("\n");

  const { stdout, status } = spawnSync("node", [entry], { input: `${request}\n`, encoding: "utf8" });
  if (status !== 0 && !stdout) throw new Error("the server did not answer tools/list");

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id === 2) return msg.result.tools;
  }
  throw new Error("no tools/list response in the server's output");
}

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

const tools = readToolsFromServer(join(root, "dist", "index.js"));
console.log(`  ${tools.length} tools read from the server`);

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

const bundle = join(root, `freehire-${pkg.version}.mcpb`);

execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "pack", ".", bundle], {
  cwd: stage,
  stdio: "inherit",
});

// The two validators disagree, so the manifest is packed twice.
//
// `mcpb pack` permits only {name, description} per tool and rejects inputSchema,
// annotations and execution as unrecognized keys. Smithery rejects that same short
// form — one "expected object, received undefined" per tool — and scores a server
// with no readable tools at 0/40 on capability. Neither will accept the other's
// manifest.
//
// So pack passes the spec-clean manifest through mcpb's validator, then replace the
// manifest inside the archive (a bundle is a zip) with the full one. Hosts that read
// tool metadata get it; hosts that ignore unknown keys are unaffected; the server
// itself is untouched either way.
manifest.tools = tools;
writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
execFileSync("zip", ["-q", bundle, "manifest.json"], { cwd: stage, stdio: "inherit" });
console.log(`  manifest replaced with the ${tools.length}-tool version`);

rmSync(stage, { recursive: true, force: true });
