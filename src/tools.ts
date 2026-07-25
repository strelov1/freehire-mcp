// Registers the freehire tools on an McpServer. Each tool is a thin wrapper over a
// client method: it returns the raw API `data` as JSON text, and an API failure
// becomes an isError result (so the agent sees the status, not a crash).

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ApiError, type Client } from "./client.js";
import { buildFacetParams, marketFacetShape, type FacetInput } from "./facets.js";

/** GetClient lazily resolves the API client, throwing when unauthenticated so the
 * error surfaces as a tool result rather than a failed server launch. */
export type GetClient = () => Client;

type Content =
  | { type: "text"; text: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } };

type ToolResult = {
  content: Content[];
  isError?: boolean;
};

/** ok serializes API data as pretty JSON text — faithful to the API for the agent. */
function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** fail turns an error into an isError result, adding an auth hint on a 401. */
function fail(err: unknown): ToolResult {
  let msg = err instanceof Error ? err.message : String(err);
  if (err instanceof ApiError && err.status === 401) {
    msg += " (set FREEHIRE_TOKEN or run `freehire auth login`)";
  }
  return { content: [{ type: "text", text: msg }], isError: true };
}

/** run executes a client call, mapping success/failure to a tool result. */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    return fail(err);
  }
}

const slug = z.string().min(1).describe("The job's public slug (from search or facets results).");

/** registerTools wires every freehire tool onto server, resolving the client lazily
 * through getClient on each call. */
export function registerTools(server: McpServer, getClient: GetClient): void {
  server.registerTool(
    "whoami",
    {
      description:
        "Return the authenticated freehire user (verifies the API key). Call this to confirm auth before other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getClient().me()),
  );

  server.registerTool(
    "facets",
    {
      description:
        "List the market's filter vocabulary: every facet's live values with a vacancy count each, plus the skills list and numeric ranges. Call this FIRST to discover real values for `search` and `market_fit` — do not invent facet values.",
      inputSchema: { ...marketFacetShape },
      annotations: { readOnlyHint: true },
    },
    async (input) => run(() => getClient().facets(buildFacetParams(input as FacetInput))),
  );

  server.registerTool(
    "search",
    {
      description:
        "Search open jobs by keyword with optional facet filters. Each result carries the job's FULL description as markdown alongside title, company, location and public_slug, plus the total match count — so you can screen a whole result set without calling `job` per hit. Use the returned slug with `job`, `apply`, `save`, etc.",
      inputSchema: {
        query: z.string().describe("Keyword query, e.g. 'golang backend'. Empty string matches all."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Max results to return. Each result includes a full job description, so prefer a modest value."),
        offset: z.number().int().min(0).default(0).describe("Pagination offset."),
        skills: z
          .array(z.string())
          .optional()
          .describe("Filter to jobs listing these skills (canonical slugs from the `facets` tool)."),
        ...marketFacetShape,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit, offset, skills, ...facets }) => {
      const params = buildFacetParams(facets as FacetInput);
      if (skills) for (const s of skills) params.append("skills", s);
      return run(() => getClient().search(query, limit, offset, params));
    },
  );

  server.registerTool(
    "market_fit",
    {
      description:
        "Score a skill list against the live open-vacancy market for a filtered role: headline coverage (% of vacancies listing ≥1 skill), must-have skills held, and the missing skills that unlock the most vacancies. Here `skills` is the MEASURED set, not a filter — use facet params to define the role. One skill probes that skill's demand.",
      inputSchema: {
        skills: z
          .array(z.string())
          .min(1)
          .describe("The candidate's skills to measure (canonical slugs). One value probes a single skill."),
        ...marketFacetShape,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ skills, ...facets }) =>
      run(() => getClient().coverage(skills, buildFacetParams(facets as FacetInput))),
  );

  server.registerTool(
    "job",
    {
      description: "Fetch a single job's full content by slug (title, company, location, posting URL, description).",
      inputSchema: { slug },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => run(() => getClient().getJob(slug)),
  );

  server.registerTool(
    "company",
    {
      description: "Fetch a company and its open jobs by company slug.",
      inputSchema: { slug: z.string().min(1).describe("The company slug (from a job's company_slug).") },
      annotations: { readOnlyHint: true },
    },
    async ({ slug }) => run(() => getClient().getCompany(slug)),
  );

  server.registerTool(
    "apply",
    {
      description: "Mark a job as applied for the authenticated user. Idempotent.",
      inputSchema: { slug },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug }) => run(() => getClient().apply(slug)),
  );

  server.registerTool(
    "save",
    {
      description: "Bookmark a job for later. Idempotent.",
      inputSchema: { slug },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug }) => run(() => getClient().save(slug)),
  );

  server.registerTool(
    "unsave",
    {
      description: "Remove a job's bookmark. A no-op if it was not saved.",
      inputSchema: { slug },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug }) => run(() => getClient().unsave(slug)),
  );

  server.registerTool(
    "stage",
    {
      description:
        "Set a job's application stage. The server validates the value; valid stages are applied/screening/responded/interview/offer/accepted/rejected/withdrawn.",
      inputSchema: {
        slug,
        stage: z.string().min(1).describe("Application stage, e.g. interview, offer, rejected."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug, stage }) => run(() => getClient().track(slug, { stage })),
  );

  server.registerTool(
    "note",
    {
      description: "Attach a free-text note to a tracked job (overwrites the existing note).",
      inputSchema: {
        slug,
        note: z.string().describe("Free-text note to store on the job."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug, note }) => run(() => getClient().track(slug, { notes: note })),
  );

  server.registerTool(
    "my",
    {
      description:
        "List the caller's tracked jobs (viewed/saved/applied) with their stage and note. Filter narrows the set.",
      inputSchema: {
        filter: z
          .enum(["all", "viewed", "saved", "applied"])
          .default("all")
          .describe("Which tracked jobs to list."),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, limit, offset }) => run(() => getClient().myJobs(filter, limit, offset)),
  );

  // CV tailoring — read the fit context, read/patch the CV document, render a PDF.
  // Beta-gated on the server; acts as the authenticated user. Addressed by CV id.
  const cvId = z.number().int().describe("The CV id (from the tailoring session bootstrap).");

  server.registerTool(
    "cv_context",
    {
      description:
        "Show the cached fit-analysis context a tailored CV should reframe toward: verdict, recommendation, dimension comments, and the requirement split — missing_have (reframe existing evidence) vs missing_gap (ask the candidate before adding). Read this before editing.",
      inputSchema: { id: cvId },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => run(() => getClient().tailorCVContext(id)),
  );

  server.registerTool(
    "cv_get",
    {
      description:
        "Fetch a tailored CV with its full document (header, summary, experience bullets, skill groups).",
      inputSchema: { id: cvId },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => run(() => getClient().getCV(id)),
  );

  server.registerTool(
    "cv_edit",
    {
      description:
        "Apply ONE field-level patch to a tailored CV. `patch` is a cv.Patch object: an `op` plus its address/payload. Ops: set_summary, set_header_field, add_bullet, replace_bullet, remove_bullet, reorder_bullets, set_skill_group, set_stack. The server sanitizes and validates it (a bad patch is a 422). Never fabricate: reframe existing evidence for missing_have requirements; for missing_gap, confirm with the candidate first. Export the finished PDF with `cv_render`.",
      inputSchema: {
        id: cvId,
        patch: z
          .record(z.unknown())
          .describe('One cv.Patch object, e.g. {"op":"add_bullet","experience":0,"value":"Cut p99 latency 40%"}.'),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ id, patch }) => run(() => getClient().patchCV(id, patch)),
  );

  server.registerTool(
    "cv_render",
    {
      description:
        "Render a tailored CV to an ATS PDF, returned as a base64 resource (application/pdf). The bytes are large and not human-readable to the model — call it to produce the deliverable, not to inspect content.",
      inputSchema: { id: cvId },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      try {
        const pdf = await getClient().renderCV(id);
        return {
          content: [
            {
              type: "resource",
              resource: {
                uri: `cv://${id}.pdf`,
                mimeType: "application/pdf",
                blob: Buffer.from(pdf).toString("base64"),
              },
            },
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "submit",
    {
      description:
        "Submit a vacancy for moderation. The server stores it as pending and returns it. URL (the dedup key), title, and company are required.",
      inputSchema: createJobShape(),
      annotations: { readOnlyHint: false },
    },
    async (input) => run(() => getClient().submit(input)),
  );

  server.registerTool(
    "my_submissions",
    {
      description: "List the caller's own vacancy submissions with their moderation status.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getClient().mySubmissions()),
  );

  // Moderator-only tools. A regular API key gets a 403 (surfaced as isError).
  server.registerTool(
    "jobs_add",
    {
      description:
        "Moderator: create a hand-curated job. URL is the dedup key — re-adding the same URL updates the posting. `description` is stored and rendered as HTML. Requires the moderator role (403 otherwise).",
      inputSchema: createJobShape(),
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async (input) => run(() => getClient().createJob(input)),
  );

  server.registerTool(
    "jobs_edit",
    {
      description:
        "Moderator: partially update a manual job by slug. Only the provided fields change; the URL identity is not editable. Requires the moderator role (403 otherwise).",
      inputSchema: {
        slug,
        title: z.string().optional(),
        company: z.string().optional(),
        location: z.string().optional(),
        remote: z.boolean().optional(),
        description: z.string().optional().describe("Stored and rendered as HTML."),
        posted_at: z.string().optional().describe("RFC3339 timestamp."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ slug, ...params }) => run(() => getClient().editJob(slug, params)),
  );

  server.registerTool(
    "submissions_pending",
    {
      description: "Moderator: list the pending submission review queue. Requires the moderator role (403 otherwise).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getClient().pendingSubmissions()),
  );

  server.registerTool(
    "submission_approve",
    {
      description: "Moderator: approve a pending submission, minting a live job. Requires the moderator role (403 otherwise).",
      inputSchema: { id: z.number().int().describe("The submission id.") },
      annotations: { readOnlyHint: false },
    },
    async ({ id }) => run(() => getClient().approveSubmission(id)),
  );

  server.registerTool(
    "submission_reject",
    {
      description: "Moderator: reject a pending submission with an optional reason. Requires the moderator role (403 otherwise).",
      inputSchema: {
        id: z.number().int().describe("The submission id."),
        reason: z.string().default("").describe("Optional rejection reason."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ id, reason }) => run(() => getClient().rejectSubmission(id, reason)),
  );
}

/** createJobShape is the shared input schema for `submit` and `jobs_add`. */
function createJobShape() {
  return {
    url: z.string().url().describe("The posting URL — the dedup key. Required."),
    title: z.string().min(1).describe("Job title. Required."),
    company: z.string().min(1).describe("Company name. Required."),
    source: z.string().optional().describe("The posting's real origin (defaults to 'manual' server-side)."),
    location: z.string().optional(),
    remote: z.boolean().optional(),
    description: z.string().optional().describe("Stored and rendered as HTML."),
    posted_at: z.string().optional().describe("RFC3339 timestamp."),
  };
}
