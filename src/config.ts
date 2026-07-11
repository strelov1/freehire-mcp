// Resolves and reads the freehire credentials: the API token and base URL.
// Precedence mirrors the freehire CLI: environment variable > ~/.freehire/creds.json
// (written by `freehire auth login`) > built-in default. The MCP server only reads
// the credentials file; logging in stays the CLI's job.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** DEFAULT_API_URL is the production API base when none is configured. */
export const DEFAULT_API_URL = "https://freehire.dev";

/** Environment variables that override the stored credentials. */
export const ENV_TOKEN = "FREEHIRE_TOKEN";
export const ENV_API_URL = "FREEHIRE_API_URL";

/** NotAuthenticatedError is thrown by resolveConfig when no token is configured. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("not authenticated: set FREEHIRE_TOKEN or run `freehire auth login`");
    this.name = "NotAuthenticatedError";
  }
}

/** Creds is the persisted credential file (~/.freehire/creds.json). */
interface Creds {
  token?: string;
  api_url?: string;
}

/** Resolved is the effective token and API URL after applying precedence. */
export interface Resolved {
  token: string;
  apiURL: string;
}

/** credsPath returns the credentials file path (~/.freehire/creds.json). */
export function credsPath(): string {
  return path.join(os.homedir(), ".freehire", "creds.json");
}

/** loadCreds reads the credentials file; a missing file yields empty creds. */
export function loadCreds(): Creds {
  try {
    return JSON.parse(fs.readFileSync(credsPath(), "utf8")) as Creds;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

/**
 * resolveConfig computes the effective token and API URL with precedence
 * env > creds file > default. The token is required (else NotAuthenticatedError);
 * the URL falls back to DEFAULT_API_URL.
 */
export function resolveConfig(env: NodeJS.ProcessEnv = process.env): Resolved {
  const creds = loadCreds();
  const token = env[ENV_TOKEN] || creds.token || "";
  if (!token) throw new NotAuthenticatedError();
  const apiURL = env[ENV_API_URL] || creds.api_url || DEFAULT_API_URL;
  return { token, apiURL };
}
