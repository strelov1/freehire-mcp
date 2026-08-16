import { createRequire } from "node:module";

/** The version the host displays in serverInfo. Read from package.json rather than
 * written out by hand: this string sat at 0.1.0 through four releases, because
 * nothing fails when it goes stale.
 *
 * `../package.json` resolves from `dist/` in the npm package and from `server/` in
 * the MCPB bundle alike.
 *
 * It lives in its own module so tests can assert on it without importing index.ts,
 * which starts the stdio server as a side effect of being imported. */
export const VERSION: string = createRequire(import.meta.url)("../package.json").version;
