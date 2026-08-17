// A thin HTTP client for the freehire API. It authenticates with an API key
// (Authorization: Bearer) and returns the raw `data` field of each response, so
// tools can serialize it verbatim for the agent. Mirrors the freehire CLI client.

/** ApiError is a non-2xx API response, carrying the HTTP status so callers can
 * branch on it (e.g. 401 → prompt to authenticate). */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message ? `api error ${status}: ${message}` : `api error ${status}`);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Page is a slice of list results: the raw `data` array plus the total match
 * count from `meta`. Returned by search and myJobs. */
export interface Page {
  data: unknown;
  total: number;
}

/** envelope is the shared API response wrapper: {data, meta, error}. */
interface Envelope {
  data?: unknown;
  meta?: { total?: number };
  error?: string;
}

/** CreateJobParams is the body for creating a moderator-authored job (POST /jobs).
 * url (the dedup key), title, and company are required; the rest is optional. */
export interface CreateJobParams {
  url: string;
  source?: string;
  title: string;
  company: string;
  location?: string;
  remote?: boolean;
  description?: string;
  posted_at?: string;
}

/** EditJobParams is the body for editing a manual job (PATCH /jobs/:slug). Every
 * field is optional; an omitted field leaves that column unchanged. */
export interface EditJobParams {
  title?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  description?: string;
  posted_at?: string;
}

/** Client talks to the freehire API, sending the API key as a bearer token on
 * every request. fetchImpl is injectable for testing. */
export class Client {
  private readonly baseURL: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseURL: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
  }

  /** me returns the authenticated user (GET /auth/me); the whoami by API key. */
  async me(): Promise<unknown> {
    return (await this.do("GET", "/api/v1/auth/me")).data;
  }

  /** search runs a keyword job search with optional facet filters
   * (GET /agent/jobs/search). That endpoint runs the same query as the web's
   * /jobs/search but, for programmatic consumers, replaces the index's truncated
   * preview with each job's full description — so a host can screen a result set
   * without a follow-up `job` call per hit. Markdown keeps the posting's lists and
   * headings intact. params carries the facet query values; q/limit/offset are set here. */
  async search(query: string, limit: number, offset: number, params: URLSearchParams): Promise<Page> {
    params.set("q", query);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("semantic_ratio", "0"); // keyword search, matching the web client
    params.set("include_description", "true");
    params.set("description_format", "markdown");
    const env = await this.do("GET", `/api/v1/agent/jobs/search?${params.toString()}`);
    return { data: env.data, total: env.meta?.total ?? 0 };
  }

  /** coverage scores a skill list against the facet-filtered market
   * (POST /market/coverage): skills go in the body, facets in the query string. */
  async coverage(skills: string[], params: URLSearchParams): Promise<unknown> {
    return (await this.do("POST", withQuery("/api/v1/market/coverage", params), { skills })).data;
  }

  /** facets returns the market's facet-value distributions under an optional
   * filter (GET /jobs/facets): the filter/skill vocabulary with counts. */
  async facets(params: URLSearchParams): Promise<unknown> {
    return (await this.do("GET", withQuery("/api/v1/jobs/facets", params))).data;
  }

  /** getJob fetches a single job by its public slug (GET /jobs/:slug). */
  async getJob(slug: string): Promise<unknown> {
    return (await this.do("GET", `/api/v1/jobs/${encodeURIComponent(slug)}`)).data;
  }

  /** getCompany fetches a company and its open jobs by slug (GET /companies/:slug). */
  async getCompany(slug: string): Promise<unknown> {
    return (await this.do("GET", `/api/v1/companies/${encodeURIComponent(slug)}`)).data;
  }

  /** apply marks a job applied for the authenticated user (POST /jobs/:slug/apply). */
  async apply(slug: string): Promise<unknown> {
    return (await this.do("POST", `/api/v1/jobs/${encodeURIComponent(slug)}/apply`)).data;
  }

  /** save bookmarks a job (POST /jobs/:slug/save). */
  async save(slug: string): Promise<unknown> {
    return (await this.do("POST", `/api/v1/jobs/${encodeURIComponent(slug)}/save`)).data;
  }

  /** unsave removes a job's bookmark (DELETE /jobs/:slug/save). */
  async unsave(slug: string): Promise<unknown> {
    return (await this.do("DELETE", `/api/v1/jobs/${encodeURIComponent(slug)}/save`)).data;
  }

  /** track sets a job's application stage and/or notes (PATCH /jobs/:slug/track).
   * An omitted field is left unchanged by the server (partial update). */
  async track(slug: string, fields: { stage?: string; notes?: string }): Promise<unknown> {
    return (await this.do("PATCH", `/api/v1/jobs/${encodeURIComponent(slug)}/track`, fields)).data;
  }

  /** myJobs lists the caller's tracked jobs (GET /me/tracking), filtered by
   * all/viewed/saved/applied. */
  async myJobs(filter: string, limit: number, offset: number): Promise<Page> {
    const q = new URLSearchParams();
    if (filter) q.set("filter", filter);
    q.set("limit", String(limit));
    q.set("offset", String(offset));
    const env = await this.do("GET", `/api/v1/me/tracking?${q.toString()}`);
    return { data: env.data, total: env.meta?.total ?? 0 };
  }

  /** createJob creates a hand-curated job (POST /jobs, moderator only). Re-creating
   * the same URL updates the posting (idempotent upsert on the server). */
  async createJob(params: CreateJobParams): Promise<unknown> {
    return (await this.do("POST", "/api/v1/jobs", params)).data;
  }

  /** editJob partially updates a manual job (PATCH /jobs/:slug, moderator only). */
  async editJob(slug: string, params: EditJobParams): Promise<unknown> {
    return (await this.do("PATCH", `/api/v1/jobs/${encodeURIComponent(slug)}`, params)).data;
  }

  /** submit queues a vacancy for moderation (POST /submissions). */
  async submit(params: CreateJobParams): Promise<unknown> {
    return (await this.do("POST", "/api/v1/submissions", params)).data;
  }

  /** mySubmissions lists the caller's own submissions with their status
   * (GET /me/submissions). */
  async mySubmissions(): Promise<unknown> {
    return (await this.do("GET", "/api/v1/me/submissions")).data;
  }

  /** pendingSubmissions lists the moderator review queue (GET /submissions). */
  async pendingSubmissions(): Promise<unknown> {
    return (await this.do("GET", "/api/v1/submissions")).data;
  }

  /** approveSubmission approves a pending submission, minting a live job
   * (POST /submissions/:id/approve, moderator only). */
  async approveSubmission(id: number): Promise<unknown> {
    return (await this.do("POST", `/api/v1/submissions/${id}/approve`)).data;
  }

  /** rejectSubmission rejects a pending submission with an optional reason
   * (POST /submissions/:id/reject, moderator only). */
  async rejectSubmission(id: number, reason: string): Promise<unknown> {
    return (await this.do("POST", `/api/v1/submissions/${id}/reject`, { reason })).data;
  }

  // CV-tailoring endpoints (beta-gated on the server), acting as the authenticated
  // user. Mirrors the freehire CLI's `cv` command group.

  /** listCVs returns the caller's tailored CVs, newest edit first, each with the vacancy
   * it was written for (GET /me/cvs). This is where a CV id comes from: every other CV
   * method takes one, and the id is opaque, so it has to be read rather than constructed. */
  async listCVs(): Promise<unknown> {
    return (await this.do("GET", "/api/v1/me/cvs")).data;
  }

  /** tailorCV starts (or reopens) tailoring for a vacancy and returns the tailored CV's
   * id, the base it was copied from, and the bound agent session (POST /me/cvs/tailor).
   *
   * Idempotent per vacancy: calling it again for the same slug returns the copy that
   * already exists rather than making a second one, so it is safe to call when you do not
   * know whether one exists. It debits an AI credit the first time it creates the copy
   * (402 when the balance will not cover it) and 409s when the candidate has no résumé to
   * seed a base CV from. It never calls a model itself. */
  async tailorCV(jobSlug: string): Promise<unknown> {
    return (await this.do("POST", "/api/v1/me/cvs/tailor", { job_slug: jobSlug })).data;
  }

  /** tailorCVContext returns the cached fit-analysis context a tailored CV should
   * reframe toward — verdict, recommendation, and the missing_have / missing_gap
   * requirement split (GET /me/cvs/:id/tailor-context). */
  async tailorCVContext(cvID: string): Promise<unknown> {
    return (await this.do("GET", `${cvPath(cvID)}/tailor-context`)).data;
  }

  /** getCV fetches a CV with its full document (GET /me/cvs/:id). */
  async getCV(cvID: string): Promise<unknown> {
    return (await this.do("GET", cvPath(cvID))).data;
  }

  /** patchCV applies a batch of path operations to a CV (PATCH /me/cvs/:id).
   *
   * The server decodes the body strictly — unknown fields are rejected — so it has to
   * be exactly `{ops, note?}`, with each op addressed by a path into the document
   * (`experience[0].bullets[1]`). Sending a bare patch object is a 422, not a
   * best-effort apply.
   *
   * The whole batch applies or none of it does, and it lands as one entry in the
   * candidate's revision history, so related edits belong in one call. */
  async patchCV(cvID: string, ops: unknown[], note?: string): Promise<unknown> {
    const body: { ops: unknown[]; note?: string } = { ops };
    if (note) body.note = note;
    return (await this.do("PATCH", cvPath(cvID), body)).data;
  }

  /** renderCV downloads a CV rendered to PDF (GET /me/cvs/:id/pdf). Unlike the other
   * endpoints this returns raw PDF bytes, not the JSON envelope, so it bypasses do(). */
  async renderCV(cvID: string): Promise<Uint8Array> {
    const resp = await this.fetchImpl(this.baseURL + `${cvPath(cvID)}/pdf`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/pdf" },
    });
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!resp.ok) {
      let message = "";
      try {
        message = (JSON.parse(Buffer.from(buf).toString("utf8")) as Envelope).error ?? "";
      } catch {
        // A non-JSON error body just leaves the message empty; the status still carries.
      }
      throw new ApiError(resp.status, message);
    }
    return buf;
  }

  /** listExperience returns the caller's whole bank, grouped by employment
   * (GET /me/experience). Achievements attached to no place come back under `unplaced`.
   *
   * This is where an `evidence_id` for patchCV comes from — without it the honest wall
   * has no key, since every claim about the candidate has to cite a banked achievement. */
  async listExperience(): Promise<unknown> {
    return (await this.do("GET", "/api/v1/me/experience")).data;
  }

  /** addEmployment records a place evidence was produced — a job or a project
   * (POST /me/experience/employments). */
  async addEmployment(params: EmploymentFields): Promise<unknown> {
    return (await this.do("POST", "/api/v1/me/experience/employments", params)).data;
  }

  /** addAchievement records one piece of evidence (POST /me/experience/atoms).
   *
   * Provenance is not a parameter: the server stamps a POST-created achievement `manual`
   * whatever is sent, because there is no transcript behind a plain HTTP call to check a
   * stronger claim against. A claim already in the bank, under any spelling, comes back
   * as 409 rather than a duplicate row — which is why correcting one matters. */
  async addAchievement(params: AchievementFields): Promise<unknown> {
    return (await this.do("POST", "/api/v1/me/experience/atoms", params)).data;
  }

  /** updateEmployment corrects a banked place (PUT /me/experience/employments/:id).
   *
   * The API REPLACES the whole row, so this reads the bank first and sends it back with
   * only the named fields changed. Passing the caller's fields straight through would
   * write empty over everything they did not mention. */
  async updateEmployment(id: string, changes: Partial<EmploymentFields>): Promise<unknown> {
    const current = await this.findEmployment(id);
    const body: EmploymentFields = { ...current, ...definedOnly(changes) };
    return (await this.do("PUT", `/api/v1/me/experience/employments/${encodeURIComponent(id)}`, body)).data;
  }

  /** updateAchievement corrects a banked achievement (PUT /me/experience/atoms/:id), with
   * the same read-then-replace care as updateEmployment — a claim-only fix must not delete
   * the metrics and skills that made the achievement worth citing.
   *
   * A keyed correction does NOT move the claim's provenance: the server keeps whatever the
   * row already carried, so an agent cannot promote its own inference into something
   * citable on a CV. Only the candidate's own edit on the site stamps `manual`. */
  async updateAchievement(id: string, changes: Partial<AchievementFields>): Promise<unknown> {
    const current = await this.findAchievement(id);
    const body: AchievementFields = { ...current, ...definedOnly(changes) };
    return (await this.do("PUT", `/api/v1/me/experience/atoms/${encodeURIComponent(id)}`, body)).data;
  }

  /** removeAchievement deletes one owned achievement (DELETE /me/experience/atoms/:id).
   * It takes nothing else with it, and there is no undo. */
  async removeAchievement(id: string): Promise<unknown> {
    await this.do("DELETE", `/api/v1/me/experience/atoms/${encodeURIComponent(id)}`);
    return { removed: id };
  }

  /** removeEmployment deletes one owned place (DELETE /me/experience/employments/:id).
   *
   * The server refuses this with 409 while achievements still hang off the place, because
   * the row's foreign key cascades and would delete them too. Move them with
   * updateAchievement first, then remove the empty place. */
  async removeEmployment(id: string): Promise<unknown> {
    await this.do("DELETE", `/api/v1/me/experience/employments/${encodeURIComponent(id)}`);
    return { removed: id };
  }

  /** findEmployment reads one banked place, so an update can replace the row without
   * losing what the caller did not name. A missing id fails here rather than being sent
   * as a write the server would refuse anyway. */
  private async findEmployment(id: string): Promise<EmploymentFields> {
    const bank = (await this.listExperience()) as BankResponse;
    const found = (bank?.employments ?? []).find((e) => e.id === id);
    if (!found) {
      throw new ApiError(404, `no employment ${id} in your bank — read experience_list for the ids`);
    }
    return {
      kind: found.kind,
      // A project's label is served under `name`; a job's under `company`. Both map to the
      // same stored field, and the server picks by kind on the way back in.
      company: found.company ?? found.name,
      role: found.role,
      location: found.location,
      start: found.start,
      end: found.end,
      current: found.current,
      summary: found.summary,
      stack: found.stack,
      link: found.link,
    };
  }

  private async findAchievement(id: string): Promise<AchievementFields> {
    const bank = (await this.listExperience()) as BankResponse;
    for (const e of bank?.employments ?? []) {
      const hit = (e.atoms ?? []).find((a) => a.id === id);
      // The grouping is the authority on which place an achievement belongs to, so the
      // employment id comes from the group rather than the row.
      if (hit) return { ...achievementFields(hit), employment_id: e.id };
    }
    const loose = (bank?.unplaced ?? []).find((a) => a.id === id);
    if (loose) return achievementFields(loose);
    throw new ApiError(404, `no achievement ${id} in your bank — read experience_list for the ids`);
  }

  private async do(method: string, path: string, body?: unknown): Promise<Envelope> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const resp = await this.fetchImpl(this.baseURL + path, { method, headers, body: payload });
    const text = await resp.text();

    let env: Envelope = {};
    if (text.length > 0) {
      try {
        env = JSON.parse(text) as Envelope;
      } catch (err) {
        // A malformed body on a 2xx is unexpected; surface it. On a non-2xx an
        // unparseable body just leaves env.error empty (the status still carries).
        if (resp.ok) throw new Error(`decode response: ${(err as Error).message}`);
      }
    }
    if (!resp.ok) throw new ApiError(resp.status, env.error ?? "");
    return env;
  }
}

/** withQuery appends the encoded params to path, omitting the "?" when empty. */
function withQuery(path: string, params: URLSearchParams): string {
  const enc = params.toString();
  return enc ? `${path}?${enc}` : path;
}

/** cvPath is the base API path for a tailored CV by id. */
function cvPath(cvID: string): string {
  return `/api/v1/me/cvs/${encodeURIComponent(cvID)}`;
}

/** EmploymentFields are the writable fields of a banked place. Both a job's `company` and
 * a project's `name` map to `company` here; the server serves and accepts whichever key
 * matches the kind. */
export interface EmploymentFields {
  kind?: string;
  company?: string;
  role?: string;
  location?: string;
  start?: string;
  end?: string;
  current?: boolean;
  summary?: string;
  stack?: string[];
  link?: string;
}

/** AchievementFields are the writable fields of a banked achievement. Provenance is absent
 * on purpose: no caller sends it — the server decides it from the credential — and carrying
 * it here would invite a later change to start trusting the client with it. */
export interface AchievementFields {
  claim?: string;
  context?: string;
  metrics?: string[];
  skills?: string[];
  employment_id?: string;
}

/** BankResponse is the shape of GET /me/experience, read only to support the
 * read-then-replace updates above. */
interface BankResponse {
  employments?: (EmploymentFields & { id: string; name?: string; atoms?: BankAtom[] })[];
  unplaced?: BankAtom[];
}

type BankAtom = AchievementFields & { id: string };

function achievementFields(a: BankAtom): AchievementFields {
  return { claim: a.claim, context: a.context, metrics: a.metrics, skills: a.skills };
}

/** definedOnly drops undefined entries so a spread of caller-supplied changes leaves the
 * banked value in place instead of overwriting it with undefined. */
function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
