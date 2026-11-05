# Local npm connector

An MCP host starts the npm executable over stdio and discovers local API-key tools.

## Sub-features

- `stdio-start`: initialize a real child and observe the package version.
- `stdio-discovery`: local tool names are advertised without requiring an account.
- `stdio-stop`: the helper closes the exact process it started.

## How to get to it (user POV)

- Configure Claude Desktop or another host with `npx -y freehire-mcp`.
- In this source checkout run `npm run build`, then `node dist/index.js` through an MCP host.

## Driving it with verify-freehire-mcp

Preconditions: Node dependencies installed and `dist/index.js` built.

- **Drive.** Run `node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs local --evidence "$verify_artifacts"`.
  It initializes the executable via the SDK's stdio transport, verifies its version,
  lists tools and closes the child. `local.json` must report passed and include
  `search`, `whoami`, `my`, `subscribe` and `cv_tailor`.
- **Clean up.** The command must return successfully and the SDK transport must
  close. Confirm `local.json` still exists after cleanup.

- **Inspector CLI.** Run `python3 .agents/skills/verify-freehire-mcp/scripts/verify-inspector.py local --evidence "$verify_artifacts"`. Inspect `inspector-local.json`;
  schema warnings are recorded separately from failures. Hosted checks without a
  reviewer token remain partial for the account-read entry point.

## Gotchas

- Never run the executable directly and wait for a human-readable readiness line:
  stdout is JSON-RPC and initialization comes from the host.
- Discovery proves registration and transport, not a successful authenticated API call.
- Local tools differ from the hosted 38-tool list. No OAuth-only auto-apply expansion
  is implied by possession of an API key.
