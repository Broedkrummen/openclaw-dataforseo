# Changelog

## 0.1.2

Render API login and password formats as ordinary masked credential fields in OpenClaw setup. Keep host-managed secret references supported through the manifest secret-input contract.

## 0.1.1

Clarify the public package description without the provider's internal API-version label. Update installation examples for the latest ClawHub release and OpenClaw capability consent.

## 0.1.0

Initial public package: versioned DataForSEO catalogue and nested schemas, seven native OpenClaw tools, account-wide daily spending checks, complete saved responses, automatic resumable tasks, and referenced database imports.

Includes plugin-owned agent instructions loaded on demand, clearer parameter and ID guidance, prompt research notes and twelve model-evaluation scenarios.

Collectors require successful HTTP and API statuses before completing a task. OnPage jobs remain resumable until crawl completion is explicitly reported. Saved-response deletion preserves spending records, jobs and imported database references.

Accepts plain credentials, a Base64-encoded API password, or a Base64-encoded `login:password` pair through environment variables and OpenClaw secret inputs. Encoded values are validated locally; all formats share the account spending ledger.

Account-spending reads share persistent pacing across agents. Provider rate limits and `Retry-After` headers wait and retry only the account read, preserving fresh totals and preventing duplicate paid submissions. Cancellation preserves job IDs without mutating read-only provider error messages.

The endpoint audit corrects free Keywords Data endpoint discovery, converts path-parameter required flags to booleans, identifies legacy Google AdWords collectors and adds pinned source links for OpenAPI-only routes. Sandbox coverage and the remaining production checks are included in the release reports.
