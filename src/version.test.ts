import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERSION } from "./version.js";

// The version the host shows in serverInfo used to be a literal, and sat at 0.1.0
// while the package reached 0.4.2 — nothing breaks when it drifts, so nothing caught
// it. It is now read from package.json; this pins that they cannot diverge again.
describe("VERSION", () => {
  it("matches the package version", () => {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    expect(VERSION).toBe(pkg.version);
  });

  it("is a semantic version, not a placeholder", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
