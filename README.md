# freehire MCP server

[![smithery badge](https://smithery.ai/badge/strelov1/freehire)](https://smithery.ai/servers/strelov1/freehire)

An [MCP](https://modelcontextprotocol.io) server over the [freehire](https://freehire.me)
job API. It lets any MCP host — Claude Desktop, Claude Code, or a compatible agent —
**search, filter, and apply to IT jobs** without a browser, authenticating with a
personal API key. Postings are crawled straight from company career boards — 3.3M+ open
roles across 294K companies, normalized into one schema and tagged with stack, seniority,
region and work mode ([live figures](https://freehire.me/open)).

It mirrors the [freehire CLI](https://github.com/strelov1/freehire-cli):
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

Create the `fhk_…` key in the web app (freehire.me → account menu → **API keys**).
If you already use the freehire CLI (`freehire auth login`), you can **omit `env`** —
the server reads the same `~/.freehire/creds.json`.

## Authentication

The token and API base URL resolve with precedence
**env → `~/.freehire/creds.json` → default `https://freehire.me`**:

| What | Sources |
|------|---------|
| Token | `FREEHIRE_TOKEN` → creds file |
| API base URL | `FREEHIRE_API_URL` → creds file → `https://freehire.me` |

The server only reads the credentials file (it never writes it — logging in stays the
CLI's job). If no token is configured, tools return a clear "not authenticated" error
rather than the server failing to start.

## Tools

| Tool | Purpose |
|------|---------|
| `whoami` | Authenticated user (verify the key). |
| `facets` | The filter/skill vocabulary: every facet's live values with counts. **Call first.** |
| `search` | Keyword + facet job search; returns jobs **with their full description as markdown** and the total match count. |
| `market_fit` | Score a skill list against live market demand (coverage + gaps). |
| `job` | A single job's full content by slug. |
| `company` | A company and its open jobs by slug. |
| `apply` | Mark a job applied. |
| `save` / `unsave` | Bookmark / remove a bookmark. |
| `stage` | Set the application stage (server-validated). |
| `note` | Attach a free-text note. |
| `my` | The caller's tracked jobs (all/viewed/saved/applied) with stage + note. |
| `cv_tailor` | Start (or reopen) tailoring for a vacancy; returns the CV id the other `cv_*` tools take. |
| `cv_list` | The caller's tailored CVs with the vacancy each was written for. |
| `cv_context` | The fit analysis a tailored CV should reframe toward (missing_have vs missing_gap). |
| `cv_get` | A tailored CV's full document. |
| `cv_edit` | Apply a batch of path-addressed edits to a tailored CV, atomically (server-validated; uncited claims are refused). |
| `cv_render` | Render a tailored CV to a PDF, returned as a base64 `application/pdf` resource. |
| `experience_list` | The candidate's experience bank, with each achievement's **provenance**. `cv_edit`'s `evidence_id` comes from here. |
| `experience_add_employment` / `experience_add_achievement` | Record a place, or one piece of evidence. |
| `experience_update_employment` / `experience_update_achievement` | Correct one. Field-level: what you do not name is kept. |
| `experience_remove_employment` / `experience_remove_achievement` | Delete one. No undo; a place must be empty first. |
| `submit` | Submit a vacancy for moderation. |
| `my_submissions` | The caller's submissions with status. |
| `jobs_add` / `jobs_edit` | Moderator: author / edit a job (403 without the role). |
| `submissions_pending` | Moderator: the review queue. |
| `submission_approve` / `submission_reject` | Moderator: decide on a submission. |

**Filters.** `search`, `market_fit`, and `facets` share the same market-filter
parameters: `remote`, `region`, `country`, `city`, `company`, `category`, `role`,
`seniority`, `employment_type`, `english_level`, `exclude_skill`, `salary_min`, `visa`,
plus a generic `facets` map (`{"source": "greenhouse"}`) for any other facet in the
vocabulary. Discover valid values with the `facets` tool — do not invent them. In
`search`, `skills` is a filter; in `market_fit`, `skills` is the measured set.

**Geography widens.** `region`, `country` and `city` are ONE OR-group: `region: ["eu"]`
with `country: ["IT"]` means "in Europe **or** in Italy" and returns everything the
region alone would. To search a single country, pass `country` and omit `region`. The
three name a single concept — *where* — so picking two places reads as "either", which
is what makes `region: ["eu"]` with `country: ["BR"]` ("Europe or Brazil") useful. There
is no AND to switch on: `_mode=and` does not apply to geography.

**Unread params are ignored, not refused.** A filter key the API does not recognize
does not fail the request, it widens it. Such keys come back in the result's `ignored`
list, with `did_you_mean` when only the grammatical number was wrong. `search` reports it
alongside `total`; `facets` and `market_fit` answer a single object, so they wrap it as
`{data, ignored}` — and only then, leaving a clean call's shape untouched. Any number from
a result carrying `ignored` answers a broader question than the one asked — retry with the
suggested name before reporting it.

**Descriptions.** `search` reads the API's agent endpoint, so every hit already carries
the posting's full description rendered as markdown — a host can screen a result set
without a `job` call per hit. Descriptions are long, so keep `limit` modest.

**The evidence rule.** Every achievement in the bank records who asserted it.
`cv_import`, `stated_in_chat` and `manual` mean the candidate did, and may be cited on a
CV; `agent_inferred` means a model read it into the record, and may not. `cv_edit`
refuses any claim about the candidate without an `evidence_id` pointing at a citable one,
which is why `experience_list` is the tool that makes `cv_edit` usable at all.

Correcting an achievement does not move that label: an `agent_inferred` one stays
uncitable however it is reworded. The only way it becomes citable is to ask the
candidate, then record what **they** say with `experience_add_achievement`.

**Removing is final** — the bank has no undo. A place must be emptied before it can go,
because deleting one would take every achievement under it. Folding two achievements into
one, keeping the numbers from both, is on the site.

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
