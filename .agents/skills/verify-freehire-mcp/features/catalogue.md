# Hosted public catalogue

A user can search and inspect live jobs without connecting an account.

## Sub-features

- `public-discovery`: 38 tools with eleven explicit public access policies.
- `public-search`: a real catalogue query succeeds without a credential.
- `host-presentation`: the host presents supported results and source links.

## How to get to it (user POV)

- Install Freehire in ChatGPT and start a conversation using it.
- Add `https://freehire.me/api/v1/mcp` as a custom remote connector.
- In claude.ai, connect that URL separately from installing the skill ZIP.

## Driving it with verify-freehire-mcp

Preconditions: the unified backend is deployed; the doctor command passes.

- **Transport.** Run `node .agents/skills/verify-freehire-mcp/scripts/verify-mcp.mjs hosted --evidence "$verify_artifacts"`.
  Anonymous `search_jobs` with `query: title:backend` and `limit: 1` must succeed.
  A real empty result is valid data; an error result is a failure, not zero jobs.
- **ChatGPT.** Open the connected Freehire conversation and enter:
  `Find up to three remote Go backend jobs. Show the company and original application link. Do not save or apply.`
  Capture the prompt, actual tool call and rendered response. Confirm results come
  from the live tool, supported filters are used and no account write is invoked.
- **Inspect.** Ask to inspect one returned posting and check whether it is still
  open. Compare its slug and original source link with the prior search result.

- **Inspector CLI.** Run `python3 .agents/skills/verify-freehire-mcp/scripts/verify-inspector.py hosted --evidence "$verify_artifacts"`. Inspect `inspector-hosted.json`;
  schema warnings are recorded separately from failures. Hosted checks without a
  reviewer token remain partial for the account-read entry point.

## Gotchas

- Hosted `search_jobs` uses top-level array filters, unlike the legacy account schema.
- A direct HTTP success is not proof of the ChatGPT or Claude conversation entry point.
- Do not fabricate matching vacancies when the live catalogue has no results.
