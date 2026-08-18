// The shared market-filter surface for the search, market_fit, and facets tools.
// Mirrors the freehire CLI's facet flags: named convenience filters for the
// high-traffic facets plus a generic `facets` escape hatch for the long tail.

import { z } from "zod";

/** marketFacetShape is a Zod raw shape spread into the input schema of every tool
 * that filters the market. Each named facet maps to an API query param; `facets`
 * reaches any other param in the vocabulary. */
export const marketFacetShape = {
  remote: z.boolean().optional().describe("Only remote jobs (sets work_mode=remote)."),
  region: z
    .array(z.string())
    .optional()
    .describe(
      "Region codes: global|ru|cis|central_asia|eu|us. WIDENS with country/city — " +
        "region+country means 'in the region OR the country', not 'the country inside " +
        "the region'. To search one country, pass country and OMIT region.",
    ),
  country: z
    .array(z.string())
    .optional()
    .describe(
      "ISO-3166 country codes, e.g. BR, US. Omit `region` when narrowing to a country — " +
        "the two OR together, so region+country returns everything the region alone would.",
    ),
  city: z.array(z.string()).optional().describe("City slugs. ORs with region and country."),
  company: z.array(z.string()).optional().describe("Company slugs."),
  category: z
    .array(z.string())
    .optional()
    .describe("Role categories: backend|frontend|fullstack|devops|ml_ai|qa|..."),
  role: z.array(z.string()).optional().describe("Role facet values, e.g. senior_backend."),
  seniority: z
    .array(z.string())
    .optional()
    .describe("Seniority: intern|junior|middle|senior|staff|principal|lead|c_level."),
  employment_type: z
    .array(z.string())
    .optional()
    .describe("Employment type, e.g. full_time, contract."),
  english_level: z.array(z.string()).optional().describe("English level, e.g. a2, b1, b2, c1."),
  exclude_skill: z
    .array(z.string())
    .optional()
    .describe(
      "Skills to filter OUT, e.g. python — drops jobs TAGGED with any of them. Tags come " +
        "from a curated dictionary read off the description, so this is a discovery filter, " +
        "not a fit test: a mention the dictionary does not recognise leaves the job untagged " +
        "and in the results, and a job whose real core is a stack the candidate lacks is not " +
        'removed by excluding a different one. Any other facet excludes the same way through ' +
        '`facets`, e.g. {"company_type_exclude": "outstaff"}.',
    ),
  salary_min: z.number().int().min(0).optional().describe("Minimum salary (enrichment.salary_min)."),
  visa: z.boolean().optional().describe("Only jobs offering visa sponsorship."),
  facets: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional()
    .describe(
      'Any other facet param as key→value(s), e.g. {"source": "greenhouse"}. ' +
        "Discover valid keys and values with the `facets` tool.",
    ),
};

/** FacetInput is the parsed shape of marketFacetShape. */
export type FacetInput = {
  remote?: boolean;
  region?: string[];
  country?: string[];
  city?: string[];
  company?: string[];
  category?: string[];
  role?: string[];
  seniority?: string[];
  employment_type?: string[];
  english_level?: string[];
  exclude_skill?: string[];
  salary_min?: number;
  visa?: boolean;
  facets?: Record<string, string | string[]>;
};

/** namedFacets binds each convenience filter to the API facet param it fills. */
const namedFacets: Record<string, string> = {
  region: "regions",
  country: "countries",
  city: "cities",
  company: "company_slug",
  category: "category",
  role: "role",
  seniority: "seniority",
  employment_type: "employment_type",
  english_level: "english_level",
  exclude_skill: "skills_exclude",
};

/** buildFacetParams collects the shared market-filter inputs into API query params. */
export function buildFacetParams(f: FacetInput): URLSearchParams {
  const q = new URLSearchParams();
  for (const [key, param] of Object.entries(namedFacets)) {
    const vals = f[key as keyof FacetInput] as string[] | undefined;
    if (vals) for (const v of vals) q.append(param, v);
  }
  if (f.remote) q.set("work_mode", "remote");
  if (f.salary_min && f.salary_min > 0) q.set("salary_min", String(f.salary_min));
  if (f.visa) q.set("visa_sponsorship", "true");
  if (f.facets) {
    for (const [k, v] of Object.entries(f.facets)) {
      if (Array.isArray(v)) for (const x of v) q.append(k, x);
      else q.append(k, v);
    }
  }
  return q;
}
