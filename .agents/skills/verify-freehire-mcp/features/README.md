# Freehire MCP verification map

Launch and create evidence as described in [the skill](../SKILL.md). Use a separate
checkout or coordinate exclusive access for `npm ci` and release builds; two
builds in one checkout replace the same `dist` files. Hosted reads may run side by
side, but never drive the same review account or browser tab concurrently.

Read-only probes use the real MCP transports and live API, without mock services.
Keep screenshots and command action/result evidence outside the checkout. A
missing service deployment or review credential blocks that entry point.

- [Downloadable plugins](packages.md): ChatGPT ZIP, claude.ai skill ZIP and import.
- [Local npm connector](local.md): stdio initialization, version and tool discovery.
- [Hosted catalogue](catalogue.md): canonical URL, public search and result inspection.
- [OAuth account](oauth.md): mixed authentication, account reads and legacy migration.

Every feature uses the four sections below; extend the map when a user path changes.
