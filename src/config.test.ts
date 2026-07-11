import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_API_URL,
  NotAuthenticatedError,
  loadCreds,
  resolveConfig,
} from "./config.js";

// Each test runs against a throwaway $HOME so ~/.freehire/creds.json is isolated.
let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "freehire-mcp-"));
  process.env.HOME = home;
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function writeCreds(c: object) {
  const dir = path.join(home, ".freehire");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "creds.json"), JSON.stringify(c));
}

describe("loadCreds", () => {
  it("returns empty creds when the file is missing", () => {
    expect(loadCreds()).toEqual({});
  });

  it("reads a stored token and api_url", () => {
    writeCreds({ token: "fhk_file", api_url: "https://file.example" });
    expect(loadCreds()).toEqual({ token: "fhk_file", api_url: "https://file.example" });
  });
});

describe("resolveConfig", () => {
  it("throws NotAuthenticatedError when no token is configured", () => {
    expect(() => resolveConfig({})).toThrow(NotAuthenticatedError);
  });

  it("falls back to the default API URL with only a token", () => {
    expect(resolveConfig({ FREEHIRE_TOKEN: "fhk_env" })).toEqual({
      token: "fhk_env",
      apiURL: DEFAULT_API_URL,
    });
  });

  it("prefers the env token and URL over the creds file", () => {
    writeCreds({ token: "fhk_file", api_url: "https://file.example" });
    expect(
      resolveConfig({ FREEHIRE_TOKEN: "fhk_env", FREEHIRE_API_URL: "https://env.example" }),
    ).toEqual({ token: "fhk_env", apiURL: "https://env.example" });
  });

  it("uses the creds file when the env is unset", () => {
    writeCreds({ token: "fhk_file", api_url: "https://file.example" });
    expect(resolveConfig({})).toEqual({ token: "fhk_file", apiURL: "https://file.example" });
  });
});
