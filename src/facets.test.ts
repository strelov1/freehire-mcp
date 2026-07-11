import { describe, expect, it } from "vitest";

import { buildFacetParams } from "./facets.js";

describe("buildFacetParams", () => {
  it("is empty for no filters", () => {
    expect(buildFacetParams({}).toString()).toBe("");
  });

  it("maps named facets to their API params (repeatable → OR)", () => {
    const q = buildFacetParams({ region: ["eu", "us"], company: ["acme"], category: ["backend"] });
    expect(q.getAll("regions")).toEqual(["eu", "us"]);
    expect(q.get("company_slug")).toBe("acme");
    expect(q.get("category")).toBe("backend");
  });

  it("expands the remote, salary_min, and visa shortcuts", () => {
    const q = buildFacetParams({ remote: true, salary_min: 5000, visa: true });
    expect(q.get("work_mode")).toBe("remote");
    expect(q.get("salary_min")).toBe("5000");
    expect(q.get("visa_sponsorship")).toBe("true");
  });

  it("ignores a zero salary floor and false toggles", () => {
    const q = buildFacetParams({ remote: false, salary_min: 0, visa: false });
    expect(q.toString()).toBe("");
  });

  it("passes generic facets through, accepting a scalar or an array", () => {
    const q = buildFacetParams({ facets: { source: "greenhouse", tag: ["a", "b"] } });
    expect(q.get("source")).toBe("greenhouse");
    expect(q.getAll("tag")).toEqual(["a", "b"]);
  });
});
