# OAuth account and migration

A user links their account when a personal action requires it while public tools
continue working anonymously on the same URL.

## Sub-features

- `oauth-step-up`: anonymous `my_jobs` requests sign-in before business execution.
- `oauth-read`: a dedicated reviewer grant reads its own tracked jobs.
- `oauth-invalid`: a presented invalid token receives 401, never anonymous fallback.
- `oauth-host`: the real host displays sign-in and returns to a working personal tool.
- `legacy-client`: existing `/mcp/account` connections survive migration.
- `claude-login`: an explicit Claude Code OAuth sign-in enables personal calls.

## How to get to it (user POV)

- In Freehire's ChatGPT conversation ask `Show my tracked jobs. Do not change anything.`
- In a custom connector select the canonical MCP URL and complete OAuth.
- Existing Freehire Account users reconnect their account to the original Freehire plugin.
- Claude Code: use `/mcp` to choose the Freehire server and authenticate; custom
  connectors also support `claude mcp login` with the actual configured name.

## Driving it with verify-freehire-mcp

Preconditions: unified backend and metadata are deployed, a verified dedicated
reviewer account exists, and its owner-only JSON OAuth file is available. A missing
or expired grant is a failed precondition, not a passed account-read test.

- **Transport.** Run `node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs hosted --evidence "$verify_artifacts" --token-file "$reviewer_oauth_file"`.
  Require the anonymous challenge, refused invalid token, unchanged tool definitions
  after authentication and successful `my_jobs`. Private result content is not stored.
- **Real host.** Start with an unlinked test connector in ChatGPT. Ask for tracked
  jobs, observe sign-in UI, authenticate the dedicated reviewer, approve consent,
  return to the conversation and retry the read. Capture both UI states and actual
  tool success without exposing credentials or unrelated conversations.
- **Claude Code.** In an isolated CLI configuration, add the canonical URL as an
  HTTP server, run `claude mcp login` with its configured name, authenticate the
  reviewer through the displayed OAuth URL, then complete `my_jobs`. Keep the
  actual configured name from `claude mcp list`; plugin-qualified names differ
  from standalone custom connectors. This is a separate host journey, not
  implied by SDK or Inspector success.
- **Legacy.** Run the established backend integration test
  `go test -tags=integration ./internal/api/handler -run TestMCPAuthenticatedEndpoints -count=1`
  from the freehire backend checkout. Both canonical and account paths must pass
  OAuth, API-key scope, revoked-generation and database-failure cases.

- **Inspector CLI.** Run `python3 .agents/skills/verify-freehire-mcp/scripts/verify-inspector.py hosted --evidence "$verify_artifacts" --token-file "$reviewer_oauth_file"`. Inspect `inspector-hosted.json`;
  schema warnings are recorded separately from failures. Hosted checks without a
  reviewer token remain partial for the account-read entry point.

## Gotchas

- A captured MCP challenge does not prove the host displayed a linking UI.
- A read-only probe never tests application sending or personal writes. Those need
  explicit targets, reviewed contents and separate approved test data.
- Do not delete the old endpoint or Freehire Account app until original-plugin
  sign-in, personal calls and remaining legacy client migration are verified.
- Never reuse Ilya's local API-key file for test writes or put passwords/tokens in evidence.
