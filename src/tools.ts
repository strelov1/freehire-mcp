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
        "Search open jobs by keyword with optional facet filters. Each result carries the job's FULL description as markdown alongside title, company, location and public_slug, plus the total match count — so you can screen a whole result set without calling `job` per hit. Use the returned slug with `job`, `apply`, `save`, etc. " +
        "Two traps worth knowing. Geography (region/country/city) is ONE OR-group: passing region AND country widens rather than narrows, so drop the region to search a single country. And a filter param the API does not recognize is ignored rather than refused — the search still runs, just broader — so when a result carries an `ignored` list, its `total` answers a wider question than the one asked; retry with the suggested name before reporting the number.",
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
  // The id is opaque: the API hands it out and the caller passes it back. The schema
  // deliberately does not describe its format — a client that validates the shape
  // bakes today's format into a released package, which is what an opaque id avoids.
  const cvId = z
    .string()
    .min(1)
    .describe(
      "The CV id, from cv_tailor or cv_list (or the tailoring workspace URL /tailor/<job>?cv=<id>). Opaque — never construct or guess one.",
    );

  // The two entry points. Every other CV tool takes an id, so without these the cycle can
  // be driven but not started.
  server.registerTool(
    "cv_list",
    {
      description:
        "List the caller's tailored CVs, newest edit first, each with the vacancy it was written for. Use this to find the id the other cv_* tools take, or to check whether a vacancy already has a tailored copy.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getClient().listCVs()),
  );

  server.registerTool(
    "cv_tailor",
    {
      description:
        "Start tailoring a CV to a vacancy, returning the tailored CV's id (plus the base it was copied from and the bound session). Idempotent per vacancy — calling it again for the same slug reopens the copy that already exists, so it is safe when you do not know whether one exists. It spends one of the candidate's AI credits the first time it creates the copy (402 when the balance will not cover it) and 409s when they have no résumé on the site to seed a base CV from — tell them to upload one; you cannot. It does not call a model: the reframing is your work, through cv_context and cv_edit.",
      inputSchema: { job_slug: slug },
      annotations: { readOnlyHint: false },
    },
    async ({ job_slug }) => run(() => getClient().tailorCV(job_slug)),
  );

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

  // Edits are addressed by a path into the document, the same model the CLI and the web
  // editor use. Send everything that belongs together in ONE call: the batch is atomic
  // and lands as a single, individually undoable entry in the candidate's history.
  const cvOp = z
    .object({
      kind: z
        .enum(["set", "insert", "remove", "move"])
        .describe("set replaces a node, insert adds one, remove deletes one, move reorders within its list."),
      path: z
        .string()
        .min(1)
        .describe(
          "Where to edit, 0-indexed over what cv_get returned: summary, experience[2].bullets[1], experience[0].stack[0], skills[0].items[3], education[1].degree, style.font_size.",
        ),
      value: z.unknown().optional().describe("The new content. Omit for remove and move."),
      to: z.number().int().optional().describe("Destination index. Only for move."),
      evidence_id: z
        .string()
        .optional()
        .describe("Id of the banked achievement backing this claim. Required for anything stating what the candidate did."),
    })
    .describe("One path-addressed operation.");

  server.registerTool(
    "cv_edit",
    {
      description:
        "Apply a batch of path-addressed edits to a tailored CV, atomically. Read cv_context and cv_get first — indices are counted over the document cv_get returned. THE HONEST WALL: editing with an API key edits as the tailoring agent, and the server enforces it — the candidate's own name, email, phone and links are refused, and anything stating what they DID needs evidence_id, the id of something they asserted themselves. One uncited op rejects the whole batch. For a missing_have requirement, reframe an existing bullet; for a missing_gap, ask the candidate before writing anything. A bad path is a 422 and the CV is untouched. Export with cv_render.",
      inputSchema: {
        id: cvId,
        ops: z.array(cvOp).min(1).describe("Every edit that belongs together, in one call."),
        note: z
          .string()
          .optional()
          .describe("Your own one-line reason for the change; shown to the candidate as the agent's words."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ id, ops, note }) => run(() => getClient().patchCV(id, ops, note)),
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

  // The experience bank is the durable record of what the candidate has actually done, and
  // it is what cv_edit's evidence_id points into. Without these tools the honest wall has
  // no key: every claim about the candidate needs a citation and there would be no way to
  // obtain one.
  const employmentId = z
    .string()
    .min(1)
    .describe("The employment id, from experience_list. Opaque — read it, never construct one.");
  const achievementId = z
    .string()
    .min(1)
    .describe("The achievement id, from experience_list. This is also cv_edit's evidence_id.");

  server.registerTool(
    "experience_list",
    {
      description:
        "Read the candidate's whole experience bank: every employment and the achievements attached to it, plus the ones attached to no place under `unplaced`. Each achievement carries a PROVENANCE — cv_import, stated_in_chat and manual mean the candidate asserted it and it may be cited on a CV; agent_inferred means a model read it into the record and it may NOT. Take evidence_id for cv_edit from here.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(() => getClient().listExperience()),
  );

  const employmentShape = {
    kind: z.enum(["job", "project"]).optional().describe('"job" or "project"; defaults to job on create.'),
    company: z.string().optional().describe("Company name, or the project's name."),
    role: z.string().optional().describe("The candidate's title or role there."),
    location: z.string().optional().describe("Free-text location."),
    start: z.string().optional().describe('A free-form date as it would be printed, e.g. "Mar 2021".'),
    end: z.string().optional().describe("Same format as start; omit while ongoing."),
    current: z.boolean().optional().describe("True while the candidate is still there."),
    summary: z.string().optional().describe("One line about the place, for context."),
  };

  server.registerTool(
    "experience_add_employment",
    {
      description:
        "Record a place where evidence was produced — a job or a side project. At least company or role is required. Use the returned id to attach achievements with experience_add_achievement.",
      inputSchema: employmentShape,
      annotations: { readOnlyHint: false },
    },
    async (input) => run(() => getClient().addEmployment(input)),
  );

  server.registerTool(
    "experience_add_achievement",
    {
      description:
        "Record one piece of evidence — the sentence a CV bullet would carry. Only record what the CANDIDATE told you; the server stamps anything created here `manual`, which means they asserted it, and that stamp is what lets it be cited on a CV. A claim already in the bank, under any spelling, is refused as 409 rather than duplicated — so correct the existing one with experience_update_achievement instead of re-adding it.",
      inputSchema: {
        claim: z.string().min(1).describe("The achievement as one CV-bullet-grade sentence."),
        context: z.string().optional().describe("How it was done, in a sentence or two."),
        metrics: z.array(z.string()).optional().describe('Numbers as stated, e.g. ["20s->1s"].'),
        skills: z.array(z.string()).optional().describe('Canonical skill slugs, e.g. ["go", "kubernetes"].'),
        employment_id: employmentId.optional().describe("The place this belongs to; omit to leave it unplaced."),
      },
      annotations: { readOnlyHint: false },
    },
    async (input) => run(() => getClient().addAchievement(input)),
  );

  server.registerTool(
    "experience_update_employment",
    {
      description:
        "Correct a place already in the bank. Only the fields you pass change — everything else is carried over from what is banked, because the API replaces the whole row. Use this to fix a name, a role, or dates.",
      inputSchema: { id: employmentId, ...employmentShape },
      annotations: { readOnlyHint: false },
    },
    async ({ id, ...changes }) => run(() => getClient().updateEmployment(id, changes)),
  );

  server.registerTool(
    "experience_update_achievement",
    {
      description:
        "Correct an achievement already in the bank — most often a typo in the claim, which cannot be fixed by re-adding it. Only the fields you pass change; metrics and skills REPLACE the whole list when given. Correcting does NOT change who is held to have said it: an agent_inferred achievement stays agent_inferred and stays uncitable on a CV. Confirming it with the candidate then recording what THEY said is the only way it becomes citable.",
      inputSchema: {
        id: achievementId,
        claim: z.string().optional().describe("The corrected sentence."),
        context: z.string().optional().describe("How it was done."),
        metrics: z.array(z.string()).optional().describe("Replaces the whole metrics list."),
        skills: z.array(z.string()).optional().describe("Replaces the whole skills list."),
        employment_id: employmentId.optional().describe("Move it to this place."),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ id, ...changes }) => run(() => getClient().updateAchievement(id, changes)),
  );

  server.registerTool(
    "experience_remove_achievement",
    {
      description:
        "Delete one achievement from the bank. There is no undo, so confirm with the candidate first — read it back to them and remove it only on a clear yes. It takes nothing else with it. This is how a duplicate goes: keep the richer entry, remove the other.",
      inputSchema: { id: achievementId },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ id }) => run(() => getClient().removeAchievement(id)),
  );

  server.registerTool(
    "experience_remove_employment",
    {
      description:
        "Delete a place from the bank. It must hold no achievements — removing a place would delete everything recorded under it, and the server refuses that here (409). To retire a duplicate place, move its achievements to the one being kept with experience_update_achievement, then remove the empty shell. There is no undo; confirm with the candidate first.",
      inputSchema: { id: employmentId },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ id }) => run(() => getClient().removeEmployment(id)),
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
