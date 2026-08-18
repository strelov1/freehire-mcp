import { describe, expect, it } from "vitest";

import { Client } from "./client.js";
import { buildFacetParams } from "./facets.js";

/** stubFetch answers one search request, capturing the URL it was called with. */
function stubFetch(body: unknown): { fetch: typeof globalThis.fetch; url: () => string } {
  let seen = "";
  const fetch = (async (input: RequestInfo | URL) => {
    seen = String(input);
    const headers = { "content-type": "application/json" };
    return new Response(JSON.stringify(body), { status: 200, headers });
  }) as typeof globalThis.fetch;
  return { fetch, url: () => seen };
}

describe("search warnings", () => {
  it("carries the API's ignored-param report into the result", async () => {
    // An unread filter widens the search instead of failing it, so the host
    // model has to see the warning in the payload — it never reads our stderr.
    const { fetch } = stubFetch({
      data: [],
      meta: {
        total: 0,
        ignored_params: [{ param: "country", did_you_mean: "countries" }],
      },
    });
    const c = new Client("http://api.test", "k", fetch);

    const page = await c.search("go", 5, 0, new URLSearchParams());

    expect(page.ignored).toEqual([
      { param: "country", did_you_mean: "countries" },
    ]);
  });

  it("omits the warning field when nothing was ignored", async () => {
    const { fetch } = stubFetch({ data: [], meta: { total: 3 } });
    const c = new Client("http://api.test", "k", fetch);

    const page = await c.search("go", 5, 0, new URLSearchParams());

    expect(page.ignored).toBeUndefined();
  });

  it("sends no param the API does not read", async () => {
    // semantic_ratio died with the hybrid index; include_description was never
    // read. Both would now come back as warnings nobody can act on.
    const { fetch, url } = stubFetch({ data: [], meta: { total: 0 } });
    const c = new Client("http://api.test", "k", fetch);

    await c.search("go", 5, 0, new URLSearchParams());

    const q = new URL(url()).searchParams;
    expect(q.has("semantic_ratio")).toBe(false);
    expect(q.has("include_description")).toBe(false);
    expect(q.get("description_format")).toBe("markdown");
  });
});

describe("buildFacetParams exclusions", () => {
  it("maps exclude_skill to the skills_exclude convention", () => {
    const q = buildFacetParams({ exclude_skill: ["python", "php"] });
    expect(q.getAll("skills_exclude")).toEqual(["python", "php"]);
  });
});

describe("single-object warnings", () => {
  it("carries ignored params out of facets and coverage", async () => {
    // These two answer with one object, not a list, and both turn a filter into
    // a number someone quotes — a vacancy count, a coverage percentage. The
    // model has to see that the filter was dropped, or it quotes the wider one.
    const body = {
      data: { total: 5 },
      meta: { ignored_params: [{ param: "country", did_you_mean: "countries" }] },
    };

    const facets = await new Client("http://api.test", "k", stubFetch(body).fetch).facets(
      new URLSearchParams(),
    );
    expect(facets).toEqual({ data: { total: 5 }, ignored: [{ param: "country", did_you_mean: "countries" }] });

    const coverage = await new Client("http://api.test", "k", stubFetch(body).fetch).coverage(
      ["go"],
      new URLSearchParams(),
    );
    expect(coverage).toEqual({ data: { total: 5 }, ignored: [{ param: "country", did_you_mean: "countries" }] });
  });

  it("returns the payload unwrapped when nothing was ignored", async () => {
    // A clean call keeps the shape hosts already parse: the data object itself,
    // with no wrapper to unpick.
    const { fetch } = stubFetch({ data: { total: 5 }, meta: {} });

    const facets = await new Client("http://api.test", "k", fetch).facets(new URLSearchParams());

    expect(facets).toEqual({ total: 5 });
  });
});
