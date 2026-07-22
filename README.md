# freehire MCP server

An [MCP](https://modelcontextprotocol.io) server over the [freehire](https://freehire.dev)
job API. It lets any MCP host — Claude Desktop, Claude Code, or a compatible agent —
**search, filter, and apply to IT jobs** without a browser, authenticating with a
personal API key. It mirrors the [freehire CLI](https://github.com/strelov1/freehire-cli):
same API, same credentials, exposed as MCP tools instead of shell commands.

## Install

No global install needed — the host runs it via `npx`. Add it to your host's MCP
configuration (Claude Desktop → **Settings → Developer → Edit config**, or
`~/.claude.json` for Claude Code):

```json
{
  "mcpServers": {
    "freehire": {
      "command": "npx",
      "args": ["-y", "freehire-mcp"],
      "env": { "FREEHIRE_TOKEN": "fhk_xxxxxxxx" }
    }
  }
}
```

Create the `fhk_…` key in the web app (freehire.dev → account menu → **API keys**).
If you already use the freehire CLI (`freehire auth login`), you can **omit `env`** —
the server reads the same `~/.freehire/creds.json`.

## Authentication

The token and API base URL resolve with precedence
**env → `~/.freehire/creds.json` → default `https://freehire.dev`**:

| What | Sources |
|------|---------|
| Token | `FREEHIRE_TOKEN` → creds file |
| API base URL | `FREEHIRE_API_URL` → creds file → `https://freehire.dev` |

The server only reads the credentials file (it never writes it — logging in stays the
CLI's job). If no token is configured, tools return a clear "not authenticated" error
rather than the server failing to start.

## Tools

| Tool | Purpose |
|------|---------|
| `whoami` | Authenticated user (verify the key). |
| `facets` | The filter/skill vocabulary: every facet's live values with counts. **Call first.** |
| `search` | Keyword + facet job search; returns jobs and the total match count. |
| `market_fit` | Score a skill list against live market demand (coverage + gaps). |
| `job` | A single job's full content by slug. |
| `company` | A company and its open jobs by slug. |
| `apply` | Mark a job applied. |
| `save` / `unsave` | Bookmark / remove a bookmark. |
| `stage` | Set the application stage (server-validated). |
| `note` | Attach a free-text note. |
| `my` | The caller's tracked jobs (all/viewed/saved/applied) with stage + note. |
| `cv_context` | The fit analysis a tailored CV should reframe toward (missing_have vs missing_gap). |
| `cv_get` | A tailored CV's full document. |
| `cv_edit` | Apply one field-level `cv.Patch` to a tailored CV (server-validated). |
| `cv_render` | Render a tailored CV to a PDF, returned as a base64 `application/pdf` resource. |
| `submit` | Submit a vacancy for moderation. |
| `my_submissions` | The caller's submissions with status. |
| `jobs_add` / `jobs_edit` | Moderator: author / edit a job (403 without the role). |
| `submissions_pending` | Moderator: the review queue. |
| `submission_approve` / `submission_reject` | Moderator: decide on a submission. |

**Filters.** `search`, `market_fit`, and `facets` share the same market-filter
parameters: `remote`, `region`, `country`, `city`, `company`, `category`, `role`,
`seniority`, `employment_type`, `english_level`, `salary_min`, `visa`, plus a generic
`facets` map (`{"source": "greenhouse"}`) for any other facet in the vocabulary.
Discover valid values with the `facets` tool — do not invent them. In `search`, `skills`
is a filter; in `market_fit`, `skills` is the measured set.

Each tool returns the raw API `data` as JSON text; an API error becomes an `isError`
result carrying the HTTP status (a 401 adds an auth hint).

## Develop

```bash
npm install
npm test        # vitest: config, client (mock server), facets, tool dispatch
npm run build   # tsc → dist/
```

## License

MIT — see [LICENSE](LICENSE). The freehire backend and CLI are MIT too.
