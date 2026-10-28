---
name: find-tech-jobs
description: Find open IT and software job postings with the freehire tools — search by technology, seniority, location, work mode, salary or visa sponsorship, read a posting in full, check it is still open, and look up pay, market size and which companies are hiring. Use when the user asks about open tech jobs, roles at a specific company, salaries, or who is hiring somewhere.
---

# Find tech jobs with freehire

freehire aggregates IT job postings from many company career boards and job sites. Every result names the board it came from and links to the employer's original posting.

## Tools

- `search_jobs` — find postings. Filter by `skills`, `seniority`, `work_mode`, `countries`, `cities`, `salary_min` + `salary_currency`, `visa_sponsorship`, `employment_type`, `posted_within_days`, `company_slugs`.
- `get_job` — read one posting in full by the `slug` a search result carries.
- `check_jobs_open` — confirm postings are still open, up to 50 slugs per call.
- `similar_jobs` — more postings like one.
- `salary_stats` / `job_market_stats` — pay percentiles; how many postings match and what they ask for.
- `list_filter_values` — the values a filter accepts, with counts.
- `search_companies` / `get_company` — employers by name or by where they hire.

## How to search well

1. **Synonyms in one query.** A role has several names: join two or three with an uppercase `OR`, e.g. `title:SRE OR title:"site reliability"`.
2. **Filters, not query.** Location, work mode, seniority and skills go in their filters, never in the query text.
3. **Loosen one constraint at a time.** If suspiciously few results come back, drop one filter, search again, and tell the user which one you dropped.
4. **Fix what was not understood.** If a result lists `ignored_params` (or, on the REST API, `ignored_values`), that filter or value was not recognised and the answer is not the one asked for — a misspelt skill matches nothing, so a total of 0 is a typo, not an empty market. Take the right value from `list_filter_values` and retry instead of telling the user nothing exists.
5. **Shortlist from previews.** Screen with the search results; call `get_job` only for the final 5-10.
6. **Recheck before presenting.** Run `check_jobs_open` on the shortlist and drop what has closed.
7. Countries are ISO 3166-1 alpha-2 codes (`de`, `br`, `us`), not names. Geography filters are a union: `countries` plus `cities` returns postings matching any of them, not their intersection. Describe results accordingly.
8. Present results as a table of title, company, location, posted date and link, naming the source board, so the user can apply on the employer's site.

## Beyond search

This hosted endpoint is anonymous and read-only. Saving jobs, tracking applications, job alerts and CV tailoring act on a freehire account: connect the signed-in endpoint (`https://freehire.me/api/v1/mcp/account`), or run the local server (`npx -y freehire-mcp`) with a personal API key, and those tools appear there.
