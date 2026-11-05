---
name: find-tech-jobs
description: Search 4.9M+ unique open jobs from 437 sources, inspect employers, compare salaries and hiring demand, and use a signed-in freehire account for profile-based matching, saved jobs, application tracking, job alerts and explicitly requested automatic applications. Use when the user asks for open tech roles, market research, their job-search progress or alerts, or encounters an unsupported dictionary term or a problem during that workflow.
---

# Find tech jobs with freehire

Connect `https://freehire.me/api/v1/mcp` as a remote MCP connector. Public catalogue tools work without signing in; use the host's OAuth sign-in flow when a personal tool requests it. Use the tools and input schemas discovered from that connection. Uploading this skill alone does not connect an account. On an authentication error, ask the user to reconnect through the host's sign-in flow.

freehire aggregates postings from company career boards and job sites. Preserve each result's source and original employer link.

## Search and market research

- `get_profile` reads the signed-in candidate's saved preferences and skills. Use it when the user wants personalized matching; distinguish saved preferences from requirements they give now.
- `list_filter_values` discovers supported filter values without sign-in. `facets` provides the signed-in catalogue vocabulary.
- `search_jobs` searches postings using the live public schema: filters are top-level fields, for example `{"query":"title:SRE OR title:\"site reliability\"","work_mode":["remote"],"seniority":["senior"],"limit":5}`. Discover accepted names and values with `list_filter_values`; personal tools such as `market_fit` and alert tools can have different filter schemas.
- `get_job` reads a posting by its returned slug; `check_jobs_open` checks a shortlist (up to 50 slugs); `similar_jobs` finds related postings.
- `salary_stats` reports pay percentiles; `job_market_stats` reports matching demand and requirements. Include sample sizes, currency and period when supplied; label missing salary data.
- `list_filter_values` resolves one filter's vocabulary and aliases.
- `search_companies` finds employers; `get_company` reads employer details and open-posting counts.
- `search` and `fetch` provide the connector search-and-document interface. Use their discovered schemas when the host requests that workflow; retain citations and document links from their results.
- `market_fit` measures a skill set against demand. Use its discovered schema, including nested `filters`, and separate evidence about the market from claims about the candidate.

1. Put role synonyms in one query with uppercase `OR`, such as `title:SRE OR title:"site reliability"`. Put skills, geography, seniority and work mode in the appropriate filters.
2. Read returned filter warnings and errors. Resolve unknown names or values using `list_filter_values` or signed-in `facets`. For an unrecognized skill, specialization or company industry, follow the dictionary workflow below, then retry with supported filters before drawing a conclusion from counts.
3. If results are scarce, loosen one constraint at a time and tell the user which changed. Geography filters form a union: countries and cities widen to either place. Use the country-code casing and values the live vocabulary returns.
4. Screen search previews first; use `get_job` for shortlisted postings that need fuller inspection. Check the final shortlist with `check_jobs_open` and omit closed postings.
5. Present title, company, location, posted date, source and application link in a compact table. Describe uncertain freshness or missing data explicitly. Finish a market comparison only when the filters and sample behind each figure are clear.

## Dictionary suggestions and problem reports

This configured workflow authorizes `suggest_dictionary_term` and `report_problem` when the conditions below occur during the user's task. Send them without a separate request or confirmation. Discover their live input schemas from the active connection. These reports do not replace or remove any other account tools.

When a desired skill, specialization or company industry is unrecognized by the live dictionary after checking its vocabulary and aliases, call `suggest_dictionary_term` with the user's original term and the matching `kind`: `skill`, `specialization` or `industry`. Preserve the original wording rather than submitting a guessed replacement. A suggestion requests dictionary review; it does not create a usable filter. Continue the search using supported filters or the original term as search text, and explain any changed constraints. Zero job results alone do not establish a dictionary gap; a recognized term with no matching jobs needs no suggestion.

For a genuine failed operation or missing capability that prevents an intended step, call `report_problem` with concise `goal`, `expected` and `actual` fields describing the intended step, expected behavior and observed behavior. Follow the live schema's length limits. Set `category` to `tool_error` for a failed tool operation, `missing_capability` when the needed capability is unavailable, or `other` for another product problem. Include `tool_name` and `error_code` only when supplied or known. Send the minimum technical context: exclude tokens, credentials, CV content, full conversations and contact information or other identifying personal details. Ordinary empty results and dictionary gaps alone are not product problems.

Report each distinct term or problem once during the task. Tell the user a suggestion or report was submitted only after that tool succeeds. On refusal or failure, describe the limitation accurately and continue with available alternatives. Do not retry the same report repeatedly or call `report_problem` to report a failure of either reporting tool. For an authentication or disconnected-account error, ask the user to reconnect through the host's sign-in flow; do not attempt a report through the disconnected connection. Keep progressing on the user's original task after reporting; if a reporting tool is absent from the connection, say it could not be submitted and continue.

## Saved jobs, tracking and reports

Read `my_jobs` for the user's tracked jobs. `save_job` and `unsave_job` change bookmarks; `track_job` changes application stage or note. `apply_job` records an application the user has already made; it does not send an application to an employer. `report_job` files a report about a posting.

For all other personal writes, including `report_job`, show the specific job or record and the proposed change, then obtain the user's confirmation. An explicit request containing that same action and target counts as confirmation. Preserve existing values outside the requested change. Report success only after the tool confirms it; report failures without implying the change happened.

## Job alerts

Read `list_subscriptions` for current settings and `subscription_updates` for matched postings. For a requested new alert, preview its search and delivery channels before calling `subscribe`. Use `update_subscription` for changes or pausing, and `unsubscribe` for stopping an alert or channel, with the same confirmation rule as other writes.

Follow the live schema for alert search arguments. Inspect existing settings before an update: some fields replace a whole filter or channel set. Confirm the resulting full set with the user, including removed channels or cleared filters. Use only delivery channels available to the account.

## Automatic applications and screening answers

OAuth sign-in grants access to tools; it is not permission to apply. Begin an automatic application only after an explicit request for the specific job. `auto_apply_start`, `auto_apply_retry`, `auto_apply_review` and `auto_apply_cancel` can act on attempts; inspect `auto_apply_get` or `auto_apply_list` for their current state first. Before an approval or retry that can send, show the employer, role and application contents for confirmation. A general request to find or save jobs does not authorize sending.

The account must also enable “Let connected agents apply for me” under Account → Integrations → API keys. If a tool reports that setting is off, relay its instructions and wait for the user to enable it; the agent cannot turn it on. Respect every additional server gate and review state.

Use `screening_answers_get` and `answer_bank_list` to inspect existing answers. `screening_answers_set`, `answer_bank_save` and `answer_bank_delete` require confirmation of the exact answer or deletion. Record candidate facts only from the user's statements or saved evidence; ask about unknown answers instead of inventing qualifications or consent.

CV tailoring and experience-bank editing tools belong to the separate local server, not this hosted account connection. Use only the tools advertised by the active connection.
