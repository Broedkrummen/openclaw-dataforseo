# Sandbox sample results

The initial sweep returned DataForSEO task status `40404` ("No Prepared Data Found. Please Contact Our Support Team.") for 57 endpoint calls. It used placeholder task IDs for retrieval endpoints. Subsequent collection with actual task IDs succeeded for 14 of those routes. The current unresolved count is 43. These are unavailable samples for the tested sandbox cases, not missing documentation or proof that production is broken.

All 623 catalogue endpoints were called. The separate 12 unavailable routes and one invalid-path response are not included in this list.

## Configuration audit before release

This file is a test report. The executable route definitions are in the plugin's `data/catalogue.json`.

All 43 methods and URL paths match provider definitions: 39 have captured endpoint documentation and four global Tasks Ready routes appear only in the pinned OpenAPI specification. Every tested request field is documented; path bindings match the route placeholders. The four OpenAPI-only routes are explicitly labelled in the catalogue and the table below. Their definitions do not establish current production availability.

All 43 passed the native-tool routing audit, covering 105 mocked requests across supported JSON/AI formats and sandbox/production host selection. The check verified methods, escaped path parameters, unmodified JSON payloads, exact saved response bytes and retrieval of unknown nested fields. Paid routes were blocked with the default $0 cap. This audit made no real network calls; its synthetic responses are not provider samples.

The audit corrected one free route that was incorrectly marked paid (`GET /v3/keywords_data/endpoints`), converted 116 OpenAPI path-parameter required flags from strings to booleans, marked six Google AdWords collectors as legacy, and added source links for six OpenAPI-only operations across the complete catalogue. Every other paid/free classification stayed unchanged. The 43 production results remain unverified until live testing.

Machine-readable evidence: [route-audit.json](route-audit.json) and [offline-route-audit.json](offline-route-audit.json).

## Still unverified in the sandbox: 43

| Family | Endpoint | Definition source | Billing |
| --- | --- | --- | --- |
| ai_optimization | `POST /v3/ai_optimization/claude/llm_responses/live` | [endpoint documentation](https://docs.dataforseo.com/v3/ai_optimization-claude-llm_responses-live/) | Paid |
| ai_optimization | `POST /v3/ai_optimization/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| app_data | `GET /v3/app_data/tasks_ready` | [OpenAPI only](https://github.com/dataforseo/OpenApiDocumentation/blob/702356d7be30374c95c4353c32345c61c6d7c1df/openapi_specification.yaml) | Free |
| app_data | `POST /v3/app_data/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| appendix | `GET /v3/appendix/status` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix/status/) | Free |
| backlinks | `POST /v3/backlinks/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| business_data | `GET /v3/business_data/tasks_ready` | [OpenAPI only](https://github.com/dataforseo/OpenApiDocumentation/blob/702356d7be30374c95c4353c32345c61c6d7c1df/openapi_specification.yaml) | Free |
| business_data | `GET /v3/business_data/tripadvisor/languages` | [endpoint documentation](https://docs.dataforseo.com/v3/business_data/tripadvisor/languages/) | Free |
| business_data | `GET /v3/business_data/tripadvisor/locations` | [endpoint documentation](https://docs.dataforseo.com/v3/business_data/tripadvisor/locations/) | Free |
| business_data | `GET /v3/business_data/tripadvisor/locations/{country}` | [endpoint documentation](https://docs.dataforseo.com/v3/business_data/tripadvisor/locations/) | Free |
| business_data | `POST /v3/business_data/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| content_analysis | `POST /v3/content_analysis/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| dataforseo_labs | `POST /v3/dataforseo_labs/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| dataforseo_labs | `POST /v3/dataforseo_labs/keyword_ideas/live` | [endpoint documentation](https://docs.dataforseo.com/v3/dataforseo_labs-keyword_ideas-live/) | Paid · legacy |
| domain_analytics | `POST /v3/domain_analytics/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| keywords_data | `GET /v3/keywords_data/dataforseo_trends/locations/{country}` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/dataforseo_trends/locations/) | Free |
| keywords_data | `GET /v3/keywords_data/endpoints` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/endpoints/) | Free |
| keywords_data | `GET /v3/keywords_data/google/ad_traffic_by_keywords/task_get/{id}` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/ad_traffic_by_keywords/task_get/) | Free · legacy |
| keywords_data | `GET /v3/keywords_data/google/ad_traffic_by_keywords/tasks_ready` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/ad_traffic_by_keywords/tasks_ready/) | Free · legacy |
| keywords_data | `GET /v3/keywords_data/google/ad_traffic_by_platforms/tasks_ready` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/ad_traffic_by_platforms/tasks_ready/) | Free · legacy |
| keywords_data | `GET /v3/keywords_data/google/adwords_status` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/adwords_status/) | Free · legacy |
| keywords_data | `GET /v3/keywords_data/google/categories` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/categories/) | Free · legacy |
| keywords_data | `GET /v3/keywords_data/google/keywords_for_category/tasks_ready` | [endpoint documentation](https://docs.dataforseo.com/v3/keywords_data/google/keywords_for_category/tasks_ready/) | Free · legacy |
| keywords_data | `POST /v3/keywords_data/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| merchant | `GET /v3/merchant/google/reviews/task_get/advanced/{id}` | [endpoint documentation](https://docs.dataforseo.com/v3/merchant/google/reviews/task_get/advanced/) | Free |
| merchant | `GET /v3/merchant/google/sellers/ad_url/{shop_ad_aclk}` | [endpoint documentation](https://docs.dataforseo.com/v3/merchant/google/sellers/ad_url/) | Paid |
| merchant | `GET /v3/merchant/tasks_ready` | [OpenAPI only](https://github.com/dataforseo/OpenApiDocumentation/blob/702356d7be30374c95c4353c32345c61c6d7c1df/openapi_specification.yaml) | Free |
| merchant | `POST /v3/merchant/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| on_page | `GET /v3/on_page/lighthouse/task_get/json/{id}` | [endpoint documentation](https://docs.dataforseo.com/v3/on_page/lighthouse/task_get/json/) | Free |
| on_page | `POST /v3/on_page/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |
| reviews | `GET /v3/reviews/google/languages` | [endpoint documentation](https://docs.dataforseo.com/v3/reviews-google-languages/) | Free |
| reviews | `GET /v3/reviews/google/locations` | [endpoint documentation](https://docs.dataforseo.com/v3/reviews-google-locations/) | Free |
| reviews | `GET /v3/reviews/google/task_get/{id}` | [endpoint documentation](https://docs.dataforseo.com/v3/reviews-google-task_get/) | Free |
| reviews | `GET /v3/reviews/google/tasks_ready` | [endpoint documentation](https://docs.dataforseo.com/v3/reviews-tasks_ready/) | Free |
| serp | `GET /v3/serp/endpoints` | [endpoint documentation](https://docs.dataforseo.com/v3/serp/endpoints/) | Free |
| serp | `GET /v3/serp/google/jobs/locations` | [endpoint documentation](https://docs.dataforseo.com/v3/serp/google/jobs/locations/) | Free |
| serp | `GET /v3/serp/google/search_by_image/task_get/html/{id}` | [endpoint documentation](https://docs.dataforseo.com/v3/serp/google/search_by_image/task_get/html/) | Free |
| serp | `GET /v3/serp/seznam/organic/tasks_fixed` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix/tasks_fixed/) | Free |
| serp | `GET /v3/serp/tasks_ready` | [OpenAPI only](https://github.com/dataforseo/OpenApiDocumentation/blob/702356d7be30374c95c4353c32345c61c6d7c1df/openapi_specification.yaml) | Free |
| serp | `GET /v3/serp/youtube/video_comments/tasks_fixed` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix/tasks_fixed/) | Free |
| serp | `GET /v3/serp/youtube/video_info/tasks_fixed` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix/tasks_fixed/) | Free |
| serp | `GET /v3/serp/youtube/video_subtitles/tasks_fixed` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix/tasks_fixed/) | Free |
| serp | `POST /v3/serp/id_list` | [endpoint documentation](https://docs.dataforseo.com/v3/appendix-id_list/) | Free |

Task collectors were also checked with actual provider task IDs where sandbox submissions succeeded. The Merchant ad URL route was retried with a click reference returned by the sandbox and still returned 40404. The fourteen Keywords Data task-get routes below were successfully retried in both full JSON and AI formats.

## Verified with real task IDs: 14

| Endpoint | Result |
| --- | --- |
| `GET /v3/keywords_data/bing/audience_estimation/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/keyword_performance/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/keyword_suggestions_for_url/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/keywords_for_keywords/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/keywords_for_site/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/search_volume/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/bing/search_volume_history/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google/keywords_for_keywords/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google/keywords_for_site/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google/search_volume/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google_ads/ad_traffic_by_keywords/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google_ads/keywords_for_keywords/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google_ads/keywords_for_site/task_get/{id}` | Successful collection with provider task ID |
| `GET /v3/keywords_data/google_ads/search_volume/task_get/{id}` | Successful collection with provider task ID |
