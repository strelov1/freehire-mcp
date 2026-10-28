#!/usr/bin/env node
// freehire-mcp — an MCP server over the freehire job API. The host (Claude Desktop,
// Claude Code, …) launches this binary over stdio; it exposes the freehire API as
// tools, authenticating with a personal API key resolved from the environment or
// the freehire CLI's credentials file.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Client } from "./client.js";
import { resolveConfig } from "./config.js";
import { registerTools } from "./tools.js";
import { VERSION } from "./version.js";

/** makeClientResolver returns a getClient that resolves the config once and caches
 * the client. It resolves lazily (on first tool call, not at launch) so a missing
 * token surfaces as a tool error instead of a failed server start — and a token
 * added after launch is still picked up on the next attempt. */
function makeClientResolver(): () => Client {
  let cached: Client | null = null;
  return () => {
    if (cached) return cached;
    const { token, apiURL } = resolveConfig(process.env);
    cached = new Client(apiURL, token);
    return cached;
  };
}

async function main(): Promise<void> {
  const server = new McpServer(
    { name: "freehire", version: VERSION },
    {
      instructions:
        "Tools over the freehire job API, acting as the account whose API key this is. " +
        "Searching: join a role's two or three names in one query with an uppercase OR " +
        '(title:SRE OR title:"site reliability"); put location, work mode, seniority and skills in ' +
        "filters, never in the query; if few results come back, loosen one constraint at a time and " +
        "say which. A value you are unsure of comes from `list_filter_values` or `facets`. When a " +
        "result names `ignored` params or `ignored_values`, the answer is not the one asked for — fix " +
        "the name or value and retry instead of reporting it. Shortlist from the search results, read " +
        "only the final few in full with `job`, and run `check_jobs_open` on them before presenting. " +
        "Present jobs as a table of title, company, location, posted date and link, naming the source. " +
        "Address jobs by their public_slug. `similar_jobs` finds more like one; `salary_stats` and " +
        "`job_market_stats` answer pay and market size; `market_fit` measures a skill list against demand. " +
        "Job alerts are saved searches delivered by email, Telegram, the app or a webhook, never to this " +
        "chat: run the same `search` before `subscribe`, change one by reading `list_subscriptions` and " +
        "passing `update_subscription` only what changes, pause rather than unsubscribe to hold one, and " +
        "read what alerts matched with `subscription_updates`.",
    },
  );

  registerTools(server, makeClientResolver());

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("freehire-mcp: fatal:", err);
  process.exit(1);
});
