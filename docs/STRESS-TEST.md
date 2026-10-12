# Release stress test

Tested on 12 October 2026 with OpenClaw 2026.10.1 and the DataForSEO sandbox. All network tests used sandbox.dataforseo.com. No paid calls were made.

All 623 catalogue endpoints and all 956 documented endpoint/format combinations were called through the native plugin tools. Invalid initial sample inputs were corrected against provider documentation and metadata; task collectors were retried with actual provider task IDs. This verifies the tested sandbox cases, not production data accuracy.

| Full JSON endpoint result | Count |
| --- | ---: |
| Successful data response | 446 |
| Accepted submission or control request | 87 |
| Successful empty response | 34 |
| No prepared sandbox response (40404) | 43 |
| Provider route unavailable (50304) | 12 |
| Documented path rejected (40402) | 1 |

The 333 AI-format cases returned 302 data responses, 12 successful empty responses, 12 missing samples and 7 unavailable-route responses. Every response from the endpoint/format sweeps was saved byte-for-byte and checked through the native retrieval tool.

The initial 57 missing samples included 14 Keywords Data collectors tested with placeholder IDs. All fourteen passed in full JSON and AI formats with actual task IDs. The remaining list is in [MISSING-SANDBOX-SAMPLES.md](MISSING-SANDBOX-SAMPLES.md).

## Unavailable-sample configuration audit

All 43 remaining routes passed a separate provider-definition and native-tool routing audit. It used 105 mocked requests and made no paid or production calls. The audit corrected free endpoint discovery and schema metadata; it cannot verify production data. See [MISSING-SANDBOX-SAMPLES.md](MISSING-SANDBOX-SAMPLES.md) for sources, billing classifications and evidence.

## Task and data recovery

- Seventy-one of 75 successfully submitted task workflows completed. Four collectors returned 40404: OnPage Lighthouse JSON, Google Shopping reviews, legacy Google reviews and Claude LLM responses.
- A 100-task SERP batch collected all 100 results, preserving every task ID and complete response. It submitted once.
- Cancellation and a fresh plugin instance recovered existing tasks without another submission.
- One thousand response writes and reads passed with 32 workers.
- An 8,000,046-byte response was reconstructed exactly from 334 native retrieval pages.
- Six concurrent processes made 120 simulated paid attempts: three proceeded, 117 were blocked after the configured spending cap. No real paid calls were involved.
- All 16 dataset reference imports passed with synthetic fixtures. JSONL, CSV and their gzip variants each streamed 100,000 rows to the final page without changing the original files. Purchased dataset content was not tested.

## Account rate-limit fix

The first network burst encountered a six-per-minute account-data limit. Four of 120 calls were rate limited; the other 116 passed. Account reads now share a persistent per-account queue, wait at least 10.05 seconds between starts, and retry only account reads after provider rate limits. They honor longer Retry-After headers, read fresh spending totals and never replay paid submissions. Cancellation preserves job IDs and releases locks. Persistent rate limits leave paid work blocked after three attempts.

The live regression deliberately exhausted the sandbox quota with six separate account reads, then queued ten native plugin reads from separate instances. All ten passed after automatic cooldown and retry. The run saved the rejected response and sent seventeen GET requests in total, including the six setup reads and one automatic retry. It made no POST requests or paid calls. All 30 local tests and native OpenClaw validation passed after the fix.

## Provider specification limits

Strict response checking against the pinned provider OpenAPI definitions found 564 mismatches, one pass and 58 endpoints without a formal response schema. Many mismatches originate in provider definitions that type arbitrary echoed task-data values as objects or close inherited schemas to additional fields. The OpenAPI unions were interpreted as structural unions for this check. These definitions cannot be treated as strict runtime validators for the current sandbox responses.

The plugin uses these definitions as supplementary documentation and deliberately saves complete provider responses without rejecting, dropping or transforming unfamiliar fields. Endpoint documentation remains authoritative for request constraints. Sandbox failures and specification inconsistencies do not establish that the corresponding production route is broken.

The rejected documented route is GET /v3/serp/youtube/organic/tasks_fixed. The unavailable routes are listed below.

| Endpoint reported unavailable |
| --- |
| `GET /v3/serp/google/events/locations` |
| `GET /v3/serp/google/events/task_get/advanced/{id}` |
| `GET /v3/serp/google/events/tasks_ready` |
| `POST /v3/business_data/social_media/pinterest/live` |
| `POST /v3/keywords_data/google/ad_traffic_by_keywords/live` |
| `POST /v3/keywords_data/google/ad_traffic_by_keywords/task_post` |
| `POST /v3/keywords_data/google/ad_traffic_by_platforms/live` |
| `POST /v3/keywords_data/google/ad_traffic_by_platforms/task_post` |
| `POST /v3/keywords_data/google/keywords_for_category/live` |
| `POST /v3/keywords_data/google/keywords_for_category/task_post` |
| `POST /v3/serp/google/events/live/advanced` |
| `POST /v3/serp/google/events/task_post` |
