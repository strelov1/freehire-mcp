import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { ApiError, Client } from "./client.js";

// A recording mock of the freehire API. Each test sets `handler` to shape the
// response and inspects `last` to assert what the client sent.
interface Recorded {
  method: string;
  url: string;
  auth: string | undefined;
  contentType: string | undefined;
  body: string;
}

let server: http.Server;
let baseURL: string;
let last: Recorded;
let handler: (req: Recorded) => { status: number; body: unknown };

beforeEach(async () => {
  handler = () => ({ status: 200, body: { data: null } });
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      last = {
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers.authorization,
        contentType: req.headers["content-type"] as string | undefined,
        body,
      };
      const { status, body: out } = handler(last);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function newClient() {
  return new Client(baseURL, "fhk_test");
}

describe("Client", () => {
  it("sends the bearer token and unwraps `data` on me()", async () => {
    handler = () => ({ status: 200, body: { data: { email: "me@example.com" } } });
    const data = await newClient().me();
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/api/v1/auth/me");
    expect(last.auth).toBe("Bearer fhk_test");
    expect(data).toEqual({ email: "me@example.com" });
  });

  it("search returns data + total and passes facets, q, limit, offset", async () => {
    handler = () => ({ status: 200, body: { data: [{ public_slug: "s1" }], meta: { total: 42 } } });
    const params = new URLSearchParams();
    params.append("regions", "eu");
    const page = await newClient().search("golang", 10, 20, params);
    expect(page).toEqual({ data: [{ public_slug: "s1" }], total: 42 });
    const q = new URLSearchParams(last.url.split("?")[1]);
    expect(q.get("q")).toBe("golang");
    expect(q.get("limit")).toBe("10");
    expect(q.get("offset")).toBe("20");
    expect(q.get("regions")).toBe("eu");
    expect(q.get("semantic_ratio")).toBe("0");
    // The agent endpoint, always asked for full descriptions as markdown.
    expect(last.url.startsWith("/api/v1/agent/jobs/search")).toBe(true);
    expect(q.get("include_description")).toBe("true");
    expect(q.get("description_format")).toBe("markdown");
  });

  it("coverage POSTs skills in the body and facets in the query", async () => {
    handler = () => ({ status: 200, body: { data: { coverage_percent: 80 } } });
    const params = new URLSearchParams();
    params.append("category", "backend");
    const data = await newClient().coverage(["go", "react"], params);
    expect(last.method).toBe("POST");
    expect(last.url).toBe("/api/v1/market/coverage?category=backend");
    expect(last.contentType).toBe("application/json");
    expect(JSON.parse(last.body)).toEqual({ skills: ["go", "react"] });
    expect(data).toEqual({ coverage_percent: 80 });
  });

  it("track sends PATCH and omits unset fields", async () => {
    handler = () => ({ status: 200, body: { data: { stage: "interview" } } });
    await newClient().track("my-job", { stage: "interview" });
    expect(last.method).toBe("PATCH");
    expect(last.url).toBe("/api/v1/jobs/my-job/track");
    expect(JSON.parse(last.body)).toEqual({ stage: "interview" });
  });

  it("apply POSTs to the apply path", async () => {
    handler = () => ({ status: 200, body: { data: { applied: true } } });
    await newClient().apply("my-job");
    expect(last.method).toBe("POST");
    expect(last.url).toBe("/api/v1/jobs/my-job/apply");
  });

  it("tailorCVContext GETs the tailor-context path and unwraps data", async () => {
    handler = () => ({ status: 200, body: { data: { verdict: "strong" } } });
    const data = await newClient().tailorCVContext(7);
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/api/v1/me/cvs/7/tailor-context");
    expect(last.auth).toBe("Bearer fhk_test");
    expect(data).toEqual({ verdict: "strong" });
  });

  it("getCV GETs the CV by id", async () => {
    handler = () => ({ status: 200, body: { data: { id: 7 } } });
    const data = await newClient().getCV(7);
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/api/v1/me/cvs/7");
    expect(data).toEqual({ id: 7 });
  });

  it("patchCV PATCHes the CV with the ops batch the server decodes", async () => {
    handler = () => ({ status: 200, body: { data: { id: 7 } } });
    const ops = [
      { kind: "insert", path: "experience[0].bullets[0]", value: "Led the migration", evidence_id: "atom-1" },
    ];
    await newClient().patchCV(7, ops, "reframed for the role");
    expect(last.method).toBe("PATCH");
    expect(last.url).toBe("/api/v1/me/cvs/7");
    expect(last.contentType).toBe("application/json");
    // The server decodes strictly (DisallowUnknownFields): the body is {ops, note}
    // and nothing else. A bare patch object is a 422.
    expect(JSON.parse(last.body)).toEqual({ ops, note: "reframed for the role" });
  });

  it("patchCV omits note when none is given, rather than sending an empty one", async () => {
    handler = () => ({ status: 200, body: { data: { id: 7 } } });
    await newClient().patchCV(7, [{ kind: "remove", path: "skills[2]" }]);
    expect(JSON.parse(last.body)).toEqual({ ops: [{ kind: "remove", path: "skills[2]" }] });
  });

  it("renderCV GETs the pdf path and returns the raw response bytes", async () => {
    handler = () => ({ status: 200, body: { pdf: "x" } });
    const pdf = await newClient().renderCV(7);
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/api/v1/me/cvs/7/pdf");
    expect(last.auth).toBe("Bearer fhk_test");
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(pdf).toString()).toBe('{"pdf":"x"}');
  });

  it("renderCV maps a non-2xx to an ApiError carrying the status", async () => {
    handler = () => ({ status: 422, body: { error: "bad patch" } });
    await expect(newClient().renderCV(7)).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
    });
  });

  it("maps a non-2xx response to an ApiError carrying the status and message", async () => {
    handler = () => ({ status: 401, body: { error: "unauthorized" } });
    await expect(newClient().me()).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });

  it("ApiError message includes the status", async () => {
    handler = () => ({ status: 404, body: { error: "not found" } });
    const err = await newClient()
      .getJob("nope")
      .catch((e) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain("404");
  });
});
