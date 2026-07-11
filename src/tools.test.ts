import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { Client } from "./client.js";
import { registerTools } from "./tools.js";

// A recording mock of the freehire API, plus a linked MCP client/server pair so
// tests can call tools end-to-end and assert what reached the upstream API.
let api: http.Server;
let last: { method: string; url: string; auth: string | undefined };
let apiStatus = 200;
let apiBody: unknown = { data: null };

let mcp: McpClient;

beforeEach(async () => {
  apiStatus = 200;
  apiBody = { data: null };
  api = http.createServer((req, res) => {
    last = { method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization };
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(apiStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify(apiBody));
    });
  });
  await new Promise<void>((resolve) => api.listen(0, resolve));
  const baseURL = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

  const server = new McpServer({ name: "freehire-test", version: "0" });
  registerTools(server, () => new Client(baseURL, "fhk_test"));

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcp = new McpClient({ name: "test-client", version: "0" });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
});

afterEach(async () => {
  await mcp.close();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

describe("registerTools", () => {
  it("registers the full CLI-mirrored tool set", async () => {
    const { tools } = await mcp.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "apply",
        "company",
        "facets",
        "job",
        "jobs_add",
        "jobs_edit",
        "market_fit",
        "my",
        "my_submissions",
        "note",
        "save",
        "search",
        "stage",
        "submission_approve",
        "submission_reject",
        "submissions_pending",
        "submit",
        "unsave",
        "whoami",
      ].sort(),
    );
  });

  it("search dispatches to the right path with the bearer token and facet params", async () => {
    apiBody = { data: [{ public_slug: "s1" }], meta: { total: 1 } };
    const res = await mcp.callTool({
      name: "search",
      arguments: { query: "go", region: ["eu"], skills: ["docker"] },
    });
    expect(res.isError).toBeFalsy();
    expect(last.auth).toBe("Bearer fhk_test");
    const q = new URLSearchParams(last.url.split("?")[1]);
    expect(last.url.startsWith("/api/v1/jobs/search")).toBe(true);
    expect(q.get("q")).toBe("go");
    expect(q.get("regions")).toBe("eu");
    expect(q.get("skills")).toBe("docker");
  });

  it("returns the API data as text content on success", async () => {
    apiBody = { data: { email: "me@example.com" } };
    const res = await mcp.callTool({ name: "whoami", arguments: {} });
    expect(res.isError).toBeFalsy();
    const text = (res.content as { type: string; text: string }[])[0].text;
    expect(JSON.parse(text)).toEqual({ email: "me@example.com" });
  });

  it("surfaces an API error as an isError result with an auth hint on 401", async () => {
    apiStatus = 401;
    apiBody = { error: "unauthorized" };
    const res = await mcp.callTool({ name: "whoami", arguments: {} });
    expect(res.isError).toBe(true);
    const text = (res.content as { type: string; text: string }[])[0].text;
    expect(text).toContain("401");
    expect(text).toContain("freehire auth login");
  });
});
