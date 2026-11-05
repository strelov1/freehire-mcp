---
name: verify-freehire-mcp
description: Verify Freehire ChatGPT and claude.ai release ZIPs, local stdio MCP discovery, and the hosted public/OAuth MCP before changing plugin configuration or retiring an endpoint. Capture real transport and archive evidence; distinguish service checks from a ChatGPT UI sign-in test.
---

# Verify Freehire MCP

Read [the feature index](features/README.md), then the feature being verified.
Use this checkout's source and live tool schemas; local npm and hosted tool names differ.

## Launch

Node 18+ and Python 3.9+ are required. This project has no local database or
migrations: its stdio executable calls the hosted API; its hosted plugin uses an
independently deployed Freehire backend. From the repository root:

```sh
verify_artifacts=$(mktemp -d "${BB_THREAD_STORAGE:-/tmp}/freehire-verify.XXXXXX")
verify_cache=$(mktemp -d /tmp/freehire-verify-npm.XXXXXX)
npm --cache "$verify_cache" ci
npm run build
npm run test:plugins
npm run build:plugins
node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs local --evidence "$verify_artifacts"
```

The per-run npm cache avoids modifying a shared or sandbox-restricted global
cache. Stop on a failed build command; do not inspect stale `dist` archives.

The local helper launches `node dist/index.js`, completes a real MCP initialize
and `tools/list`, and closes its own child. Ready means the reported server
version matches `package.json` and required tools are discoverable. Discovery
needs no credential or seed data. The helper supplies an invalid test key and
loopback API URL, and performs no account operation or external API call.
A private read needs a dedicated review account and a valid OAuth grant; missing
credentials are a blocked precondition, never an empty successful account.

## Doctor

```sh
node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs doctor --evidence "$verify_artifacts"
```

This read-only check requires the configured canonical URL, 38 discoverable tools,
eleven public security policies and matching RFC 9728 resource metadata. A service
still serving eleven tools or a missing metadata document is a failed deployment
precondition. Do not edit the expectation to match an old deployment.

## Drive

```sh
python3 .agents/skills/verify-freehire-mcp/scripts/verify-archives.py --evidence "$verify_artifacts"
node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs hosted --evidence "$verify_artifacts"
```

The hosted helper reads live search data, checks personal-tool OAuth step-up and
refusal of an invalid token. For authenticated proof, supply an owner-only JSON
file containing `access_token` from a dedicated review account:

```sh
node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs hosted --evidence "$verify_artifacts" --token-file "$reviewer_oauth_file"
```

No token on the command line or in evidence. Missing OAuth proof exits 2 and is
reported as partial. Authenticated driving only lists tools and reads `my_jobs`;
it neither changes account data nor submits an application. Writes require the
specific feature's preconditions and the user's existing authorization.

Also run the official Inspector CLI with pinned Inspector 2.14.0 and Node 22.23.4
(the helper installs its own compatible Node without replacing the system binary):

```sh
python3 .agents/skills/verify-freehire-mcp/scripts/verify-inspector.py local --evidence "$verify_artifacts"
python3 .agents/skills/verify-freehire-mcp/scripts/verify-inspector.py hosted --evidence "$verify_artifacts" --token-file "$reviewer_oauth_file"
```

The helper uses a temporary Inspector store and private config, disables browser
auto-open and preserves only redacted assertions/exit codes. `--strict` schema
errors fail; portability warnings are recorded separately. Optional `--npm-cache`
reuses an explicitly selected cache; otherwise its scratch cache is removed.
Anonymous personal-tool driving expects `auth_required`, not silent success.
The recipe uses a POSIX process group to terminate only its children on timeout.

For real host UI verification use the browser recipes in the feature map.
A transport challenge is not evidence that ChatGPT displayed its sign-in dialog.

## Evidence

Keep `archives.json`, `local.json`, `doctor.json`, `hosted.json`, `inspector-*.json`, command exit codes
and screenshots/snapshots from any browser journey in the unique directory. ZIP
proof includes file names, sizes, SHA-256 and included skill/manifest equality.
Transport proof keeps only bounded check names, tool names, counts and status;
private results and credentials are never persisted. Store an approved upload
ZIP beside its hash before uploading; later builds can replace `dist/plugins`.

Record every entry point exercised, unavailable preconditions and any skipped
journey explicitly. A published directory card, imported skill, scanned MCP
list and a connected ChatGPT conversation are separate proofs.

## Cleanup

After npm commands finish, remove the scratch cache created by this run with
`rm -rf -- "$verify_cache"`; preserve the evidence directory.
The local helper closes its own MCP child in `finally`; no persistent server or
port is started. After failed commands, inspect the JSON result and run again
only after fixing the failure. Close browser automation sessions created by the
run, preserving user tabs. Keep account fixtures that predated the run. Remove
only scratch data and instances this run created; never kill by process name.
Evidence and copied release ZIPs survive cleanup. Confirm with
`ls -l "$verify_artifacts"` after cleanup.

## Helpers

- `scripts/verify-archives.py` verifies the two built download archives.
- `scripts/verify-mcp.mjs` drives local stdio and hosted HTTP; invocation is above.
- `scripts/verify-inspector.py` drives the pinned official Inspector CLI.
- `scripts/expected-tools.json` defines the exact hosted public/personal capability sets.
- `features/README.md` indexes the maintained user journeys. Use
  `/maintain-verification-skill` when routes, tool schemas or packaging change.
