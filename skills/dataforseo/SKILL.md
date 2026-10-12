---
name: dataforseo
description: Use DataForSEO for search results, keyword metrics, competitor rankings, AI mentions, backlinks, website audits, ads, app and business data, and purchased SEO databases. Discover endpoints and fields, retrieve complete saved results, and resume existing tasks.
user-invocable: true
---

# DataForSEO

Answer the user's data question with the smallest set of justified calls. Reuse relevant saved results when their target, market and freshness fit the request. Keep complete source data available; return the findings the user needs.

## Choose and execute

1. Identify the target, metric, engine, market, language and time window from the request and context. Clarify only missing choices that materially change the answer. Do not silently substitute a different market or historical data for current data.
2. Search `dataforseo_catalogue` for the capability and copy its exact endpoint ID. Prefer current routes over `legacy` routes. Read `{baseDir}/references/routing.md` when choosing between API families.
3. Load `dataforseo_schema` for that ID. Follow relevant request-schema `$ref`, `oneOf` and `allOf` definitions with `schema`. Field pages mix request and response fields: use the request schema and source documentation to determine inputs. `requiredMention`, `conditional` and `documentedLiterals` are documentation hints; literals can be examples rather than allowed values.
4. Resolve location/language codes through the provider's free metadata endpoints when needed. Send the provider's complete JSON body, usually a task array. Put path placeholders in `bindings`. Never invent endpoint paths or drop requested fields because the snapshot lacks them.
5. Use live endpoints for immediate data; use supported asynchronous tasks when waiting is acceptable. `task_post` already submits, polls and fetches. Keep `format: "json"` for full data; provider `ai` responses crop fields and round values.

## Interpret and retrieve

Check HTTP status, general status and every task status. A successful submission (`20100`) is not a completed dataset. A request summary supplies status and counts, not the underlying observations: read the saved response with `dataforseo_results` before drawing conclusions.

Select relevant fields with a JSON Pointer, such as `/tasks/0/result/0/items`. Continue arrays using `nextOffset` for the requested scope. A page is not a complete export. For large fields or exact integers, use raw base64 byte pages and `nextByteOffset`; all original response data stays saved. Do not interpret missing, null or false as interchangeable.

If a job is pending or interrupted, inspect or resume its `jobId`. For `submission-uncertain`, recover existing provider task IDs through the free ID List endpoint, then `track` and `resume`. Never repeat the paid submission to recover results. If the catalogue has no documented collector for a legacy route, report that limitation and retain its IDs.

## Costs and files

The runtime checks account spending before each paid call; avoid a redundant budget call before every request. Use `dataforseo_budget` when the user asks about spending or planning needs it. A $0 or reached cap stops paid work. Continue useful catalogue or saved-data work; explain the configured limit without bypassing it. Other applications count toward the cap, and the last call may exceed it. Sandbox outputs are sample data, not current observations.

Account reads may wait in the shared rate-limit queue. The runtime retries rate-limited account reads with fresh totals. Do not resubmit paid work because an account check is waiting or interrupted; inspect saved job state first.

For purchased files, use `dataforseo_databases`: catalogue/schema, then import a reference inside configured `importRoots`. Use `itemPath` for a wrapped record array and `path` within each record. Originals remain in place. Delete results or detach imports only when requested; do not clean up saved responses automatically.

## Report

Lead with the requested findings. State the applicable market, language, dates and coverage; distinguish live, historical and sandbox data. Include useful result/job IDs for recovery. Report partial failures, pending jobs and incomplete pagination clearly. Stop when the requested evidence is sufficient; do not collect unrelated metrics.
