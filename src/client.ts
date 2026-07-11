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

  /** search runs a keyword job search with optional facet filters (GET /jobs/search).
   * params carries the facet query values; q/limit/offset are set here. */
  async search(query: string, limit: number, offset: number, params: URLSearchParams): Promise<Page> {
    params.set("q", query);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    params.set("semantic_ratio", "0"); // keyword search, matching the web client
    const env = await this.do("GET", `/api/v1/jobs/search?${params.toString()}`);
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
