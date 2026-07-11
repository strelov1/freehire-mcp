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
    { name: "freehire", version: "0.1.0" },
    {
      instructions:
        "Tools over the freehire job API. Start with `facets` to discover real filter values and skill slugs, " +
        "then `search`. Address jobs by their public_slug. Use `market_fit` to measure a CV's skills against demand.",
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
