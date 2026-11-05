# Unified setup guides

## Sub-features

- `website-address`: /mcp, /cli, /agents, /chatgpt and onboarding offer one canonical hosted URL.
- `host-login`: Claude Code and Codex describe explicit optional OAuth login.
- `directory`: the original Freehire listings advertise current tools and optional account access.
- `blog`: /blog/2026-11-05-unified-mcp explains public search, OAuth, permissions and legacy migration.

## How to get to it (user POV)

Open https://freehire.me/mcp and choose each assistant. Public search and personal
tools must use https://freehire.me/api/v1/mcp. The CLI tab documents a distinct
local executable, not a second hosted account endpoint. Follow the Claude and
ChatGPT directory links to the original Freehire listings.

## Driving it with verify-freehire-mcp

Use the browser against the running web build, then repeat after deployment.
Switch every assistant tab on /mcp and inspect the visible address, setup command
and generated prompt. Require the canonical path everywhere and no anonymous/account
connector selector. Check explicit `claude mcp login freehire` and
`codex mcp login freehire` instructions. Inspect desktop and mobile layouts, then
/cli, /agents and /chatgpt. Onboarding reuses the same setup component.

Open /blog/2026-11-05-unified-mcp and check its listing in /blog, the sitemap and RSS through
the backend repository's existing blog tests and a real build. Historic references
to /mcp/account may explain compatibility but must not be a new-setup command.

Run the hosted SDK/Inspector recipes in the main skill to verify that the documented
URL still offers both public search and OAuth account reads. Local stdio forwarding
must use that same path for both policies, sending no key for public reads and the
configured key only for allowed personal operations. Run `npm test` for this contract.

Directory tests need an authorized publisher session. Capture current settings,
server tool discovery, submitted changes and actual review status separately.
Do not claim an edit is live before the provider approves it.

## Gotchas

- Some directory tools may await provider review even when server discovery exposes them.
- A published listing may lock data-handling/compliance fields. Prepare the exact
  requested changes for the owner; do not invent approval or send an email without authorization.
- Do not assert that every tool was executed when only discovery and representative
  reads were tested. Automatic application submission needs separate approved test targets.
- Preserve existing endpoints, unrelated pending listing edits and publisher account settings.
