# OpenClaw DataForSEO

Native OpenClaw tools for DataForSEO search, keyword research, backlinks, site audits and bulk datasets. Agents search a versioned catalogue, load endpoint fields on demand, send complete request bodies, and retrieve every field from saved responses.

The initial catalogue was collected with Firecrawl on 12 October 2026. Coverage includes all **608 menu URLs**, all **618 URLs from the supplementary LLM index**, **623 API operations**, **2,648 nested OpenAPI definitions**, and **16 bulk database datasets**. It preserves 46,792 field-table rows across the documentation snapshot. The menu pages and LLM index were collected separately; the index supplemented the menu crawl. Eight HTML links in the index returned 404, but their Markdown versions were successfully collected.

The package contains factual field names, types, literal values, schema structure and source links. Full documentation captures remain in the build's research archive. See [coverage.json](data/coverage.json) and [documentation-manifest.json](data/documentation-manifest.json) for counts, source URLs and content hashes. This measures documentation coverage, not successful production execution of every endpoint.

## Install and configure

Requires Node.js 24.16 or later and OpenClaw 2026.10.1 or later. An MIT-licensed native OpenClaw plugin for the DataForSEO API.

Install the public package using OpenClaw's plugin installer:

```sh
openclaw plugins install clawhub:openclaw-dataforseo@0.1.1 --accept-capabilities
```

For a downloaded release archive:

```sh
openclaw plugins install ./openclaw-dataforseo-0.1.1.tgz --accept-capabilities
```

Make your API credentials available to the OpenClaw process using one of these formats:

| Format | Environment variables | OpenClaw secret inputs |
| --- | --- | --- |
| Plain API password | `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` | `login` and `password` |
| Base64 of the API password only | `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD_BASE64` | `login` and `passwordBase64` |
| Base64 of the complete `login:password` pair | `DATAFORSEO_AUTH_BASE64` | `authBase64` |

For the complete pair, the login is read from the decoded value. A separately supplied login must match it. The `Basic ` prefix is accepted for the complete pair. Use only one password/authentication format at a time; plain values are never guessed to be Base64. An explicitly configured credential format overrides environment credential formats. All four secret inputs support OpenClaw SecretRef resolution and are marked sensitive.

Base64 is reversible encoding and does not encrypt credentials. Keep credential files private or use OpenClaw's secret storage. The plugin decodes encoded credentials locally and sends Basic authentication over HTTPS; changing the encoding keeps the same account spending ledger.

A private environment file can contain either of these encoded formats:

```env
DATAFORSEO_LOGIN="your API login"
DATAFORSEO_PASSWORD_BASE64="Base64 of your API password only"
```

```env
DATAFORSEO_AUTH_BASE64="Base64 of your API login:API password"
```

Add the plugin configuration to your OpenClaw configuration:

```json
{
  "plugins": {
    "entries": {
      "dataforseo": {
        "enabled": true,
        "config": {
          "dailyCapUsd": 5,
          "dataDirectory": "/absolute/path/to/private/dataforseo-results",
          "importRoots": ["/absolute/path/to/purchased-databases"]
        }
      }
    }
  }
}
```

The cap defaults to **$0**, which disables paid requests. File imports default to disabled until `importRoots` is configured. Results default to `~/.openclaw/dataforseo`; they remain until explicitly deleted. All agents must use the same `dataDirectory` to share request serialization and saved jobs.

Optional settings: `sandbox` defaults to false; `requestTimeoutMs` defaults to 60,000; `workflowTimeoutMs` defaults to 120,000; `pollIntervalMs` defaults to 3,000. Restart or reload OpenClaw after changing plugin configuration, as required by your host setup.

## Agent tools

The plugin includes its own [agent instructions](skills/dataforseo/SKILL.md) for endpoint selection, full-data retrieval, cost-aware calls and job recovery. They install with the plugin; OpenClaw loads them through its bundled-skill mechanism. OpenClaw discovers them when the plugin is enabled, subject to the host's skill visibility settings; you can also invoke `$dataforseo` in a request. Detailed family-routing examples load only when needed. The [research notes](docs/PROMPT-RESEARCH.md) explain the design and [evaluation scenarios](eval/cases.json) support testing it with your chosen model. Prompt improvements have not been measured with live model trials.

| Tool                   | Purpose                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dataforseo_catalogue` | Search API operations, purchased datasets or documentation guides; page through matches.                            |
| `dataforseo_schema`    | Read endpoint fields and request/response schema roots; follow `$ref` names to nested definitions.                  |
| `dataforseo_request`   | Call a catalogue endpoint with its full JSON body and path bindings; save complete responses and summarize results. |
| `dataforseo_results`   | List, read, page or explicitly delete saved API responses.                                                          |
| `dataforseo_jobs`      | List, inspect, resume or track existing asynchronous task IDs.                                                      |
| `dataforseo_budget`    | Read the current total account spending and configured cap.                                                         |
| `dataforseo_databases` | Browse schemas, reference original database files, stream records and detach references.                            |

The catalogue exposes SERP, AI Optimization, DataForSEO Labs, Keywords Data, Backlinks, OnPage, Content Analysis, Domain Analytics, Merchant, App Data, Business Data and Appendix endpoints. Legacy routes remain visible and are marked where the documentation identifies them. Prefer current replacements when available.

Examples of tool arguments:

```json
{ "query": "google organic live advanced" }
```

```json
{ "id": "POST /v3/serp/google/organic/live/advanced" }
```

```json
{
  "id": "POST /v3/serp/google/organic/live/advanced",
  "body": [
    {
      "keyword": "albert einstein",
      "language_code": "en",
      "location_code": 2840
    }
  ]
}
```

An API request returns a `resultId`, a compact summary and, for task submissions, a `jobId`. Use the result tool with a JSON Pointer to retrieve any field:

```json
{
  "action": "read",
  "id": "RESULT_ID",
  "path": "/tasks/0/result/0/items",
  "offset": 0,
  "limit": 25
}
```

Large selections produce an explicit display-size error. Narrow the pointer or use `raw: true` with `byteOffset` and `byteLength`. Raw retrieval returns original UTF-8 bytes as base64 and a continuation offset. This preserves large integers exactly; parsed JavaScript numbers have the usual precision limit. Responses are never reduced to a fixed list of known fields. New provider fields, nulls, false values, HTML and nested data remain in the saved response.

`format: "json"` is the default. The documented `format: "ai"` option is available for supported live, task-get and location endpoints; the provider crops fields and rounds values in that format. Choose JSON when complete provider data is required. Unsupported provider responses and error bodies are also saved for inspection.

## Spending policy

Before each paid request, the plugin reads the free `appendix/user_data` endpoint and totals the account's spending for the UTC day. This includes charges from other applications. Nested aggregate totals are counted once. Confirmed response costs are retained locally to reduce the effect of delayed account statistics.

The account endpoint allows six requests per minute. Account reads share a persistent queue and are spaced at least 10.05 seconds apart, including direct requests through `dataforseo_request`. Provider rate-limit responses trigger a wait of at least 60.5 seconds (or a longer `Retry-After`) before retrying the account read, up to three attempts. Each retry reads fresh spending; paid submissions are never automatically retried. Cancelled waits preserve job IDs and release locks. Persistent rate limits keep paid calls blocked until spending can be verified.

Requests are serialized for the same account within the shared data directory. If spending is below the configured cap, a request may proceed without requiring a verified maximum price. Once spending reaches the cap, later paid requests stop. **The final request or batch may exceed the cap.** Other applications and deployments can also spend concurrently; this is a stop-after-spending policy, not a provider-enforced account limit. The plugin blocks paid requests if account spending cannot be verified.

The response's total `cost` is counted once, without adding each task's cost again. Free result collection and free metadata endpoints remain accessible after the cap is reached. The sandbox uses only `sandbox.dataforseo.com` and bypasses paid spending checks.

## Asynchronous tasks

By default, `task_post` saves the accepted task IDs, polls the documented task-get route and saves the collected results. It selects advanced results when available. OnPage tasks poll the summary until `crawl_progress` is finished. Set `wait: false` to return immediately after submission.

Timeout or cancellation leaves a resumable job. Use `dataforseo_jobs` with `action: "resume"` and the `jobId`; it fetches the existing IDs without submitting new tasks. `action: "track"`, a task-post `endpoint` ID and `taskIds` register tasks created elsewhere or recovered through the provider's ID List endpoint.

A connection failure during submission leaves `submission-uncertain`. The plugin never automatically repeats a submission whose acceptance is unknown. Inspect the account's task IDs before tracking and resuming it. Two obsolete Google AdWords task-post routes have no documented collector in the snapshot; their IDs are preserved and the job reports that collection requires a documented route. These exceptions are listed in `coverage.json`.

DataForSEO's own result availability window still applies. Saving a response locally preserves it until you delete it; a locally saved task ID does not extend the provider's retention period.

## Purchased database files

Bulk databases are purchased separately from API requests. The plugin provides their catalogue, documented field tables, available formats and sample links. It does not purchase or download datasets automatically.

To reference an original file inside an allowed directory:

```json
{
  "action": "import",
  "dataset": "google/keywords",
  "file": "/absolute/path/to/purchased-databases/keywords.json.gz",
  "format": "json"
}
```

Imports support JSON arrays, JSON or JSONL records, CSV with a header, and gzip files. For a JSON wrapper, provide `itemPath`, such as `/data/items`, pointing to the record array. During reads, `path` selects a field within each record. CSV values remain strings. Reads stream records instead of loading an entire database; memory still depends on the size of an individual record. Offset paging scans from the beginning of the source file.

Original files stay in place. Moving, deleting or changing a file requires a new reference. Symlinks resolving outside `importRoots` are rejected. `detach` deletes the saved reference and leaves the original file intact. Raw reads provide original file bytes, including compression when the source is gzip.

## Documentation updates

Catalogue updates are explicit. Installing a new release or regenerating this snapshot changes the feature list; the plugin does not fetch documentation during ordinary agent calls. Updating the catalogue does not delete saved results.

Maintainers collect the menu and supplementary index through Firecrawl, verify the coverage gate, and pin the official OpenAPI specification. The initial specification is pinned to [DataForSEO commit 702356d7](https://github.com/dataforseo/OpenApiDocumentation/commit/702356d7be30374c95c4353c32345c61c6d7c1df). Supplementary documentation fills routes and fields missing from that specification. The generator requires Python with PyYAML:

```sh
python scripts/refresh-catalogue.py \
  --spec /path/to/openapi_specification.yaml \
  --coverage /path/to/coverage-report.json \
  --fields /path/to/documentation-field-matrix.json \
  --databases /path/to/databases/catalogue-facts.json
npm run build
npm test
npm run check
npm pack
```

The generator refuses incomplete menu coverage. Required-field mentions, conditional flags and documented literals supplement structural schemas; provider-side validation remains authoritative. Agents can pass fields absent from the snapshot through the generic request tool.

For source development, install the runtime dependencies and make the tested OpenClaw SDK available as a local peer dependency (for example, `npm install --no-save --ignore-scripts openclaw@2026.10.1`). The native registration tests import that SDK directly.

## Verification and release

The local tests cover credential formats, malformed encoded values, shared spending across credential formats, catalogue completeness and schema references, OpenClaw tool registration, account caps and concurrency, original response bytes, large-result retrieval, task recovery and cancellation, collector errors, OnPage completion, file import formats, allowed directories and file changes. Rate-limit regression tests cover shared account pacing, cooldown persistence, provider errors, `Retry-After`, cancellation, fresh spending after recovery, and prevention of duplicate paid submissions. The results tool rejects attempts to delete spending records, jobs or database references. OpenClaw's build and validation commands check the native manifest.

The release archive was also installed into a temporary OpenClaw 2026.10.1 instance. Runtime inspection loaded all seven tools, and the host discovered the plugin's agent instructions as eligible and visible to the model. This check leaves the operator's existing instance unchanged.

Run the free live sandbox checks with API credentials available in the environment:

```sh
node scripts/sandbox-smoke.mjs /absolute/path/to/private/sandbox-results
```

The runner fixes the host to the sandbox, disables paid calls, and exercises live SERP, DataForSEO Labs and asynchronous submit/fetch. It saves full responses and a report. All three live sandbox smoke checks passed. A separate release stress test called all 623 endpoints and all 956 documented endpoint/format combinations, tested actual task IDs, and verified large results, bulk submissions, file imports and concurrency. Some provider routes have no prepared sandbox response, are unavailable, or reject a documented path. Provider sandbox fixtures do not establish production data accuracy or successful execution of every endpoint. See [DataForSEO's sandbox guide](https://dataforseo.com/help-center/dataforseo-sandbox-best-practices).

Code is MIT licensed. DataForSEO API access and purchased datasets remain subject to the provider's terms. This is an independent OpenClaw integration.

The complete release stress-test results and provider exceptions are recorded in [docs/STRESS-TEST.md](docs/STRESS-TEST.md).
