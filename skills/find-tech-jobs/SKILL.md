---
name: find-tech-jobs
description: Find open IT and software job postings with the freehire tools — search by technology, seniority, location, work mode, salary or visa sponsorship, read a posting in full, and look up which companies are hiring. Use when the user asks about open tech jobs, roles at a specific company, or who is hiring somewhere.
---

# Find tech jobs with freehire

freehire aggregates IT job postings from many company career boards and job sites. Every result names the board it came from and links to the employer's original posting. All tools are read-only.

## Tools

- `search_jobs` — find postings. Filter by `skills`, `seniority`, `work_mode`, `countries`, `cities`, `salary_min` + `salary_currency`, `visa_sponsorship`, `employment_type`, `posted_within_days`, `company_slugs`.
- `get_job` — read one posting in full by the `slug` a search result carries.
- `search_companies` — find employers by name or by the countries they hire in, with their open-role counts.
- `get_company` — read one employer by `slug`.

## How to use them well

1. Search first, then call `get_job` only for the postings the user wants to read in full.
2. Countries are ISO 3166-1 alpha-2 codes (`de`, `br`, `us`), not names.
3. Geography filters are a union: `countries` plus `cities` returns postings matching any of them, not their intersection. Describe results accordingly.
4. If a result lists `ignored_params`, that filter value was not recognised and the answer is wider than asked. Retry with a supported value instead of telling the user nothing exists.
5. Always show the source board and the original posting link so the user can apply on the employer's site. freehire cannot apply, save jobs or contact employers on the user's behalf.
