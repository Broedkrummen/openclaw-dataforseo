# Choose a data source

Use the catalogue for exact IDs and schemas. This table helps choose a family; it does not replace endpoint requirements.

| User needs                                                          | Start with         | Distinction                                                                          |
| ------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------ |
| Current positions, snippets, local packs, images or AI Mode         | `serp`             | Live searches differ from stored keyword rankings.                                   |
| Google Ads or Bing volume, bids and advertising metrics             | `keywords_data`    | Select the engine and market; do not substitute another volume source silently.      |
| Competitor keywords, rankings, traffic estimates, keyword expansion | `dataforseo_labs`  | Stored datasets have update dates; traffic estimates are not analytics measurements. |
| AI response samples or brand mentions                               | `ai_optimization`  | Choose LLM responses, scraper output, or stored mentions according to the question.  |
| Backlinks, referring domains and link profiles                      | `backlinks`        | Summaries and detailed link rows serve different questions.                          |
| Website crawl and technical issues                                  | `on_page`          | A crawl completes when its summary reports finished.                                 |
| Content discovery and sentiment                                     | `content_analysis` | Corpus metrics differ from a site's crawl.                                           |
| Whois and domain technologies                                       | `domain_analytics` | Select the documented domain capability.                                             |
| Shopping listings, products and sellers                             | `merchant`         | Reviews may instead belong to business or app data.                                  |
| App listings, rankings and reviews                                  | `app_data`         | Match the requested store.                                                           |
| Business listings, reviews and hotels                               | `business_data`    | Match the platform and location.                                                     |
| Purchased bulk exports                                              | Database catalogue | Import an operator file; no API call purchases a dataset.                            |

## ID and pointer examples

An endpoint ID is `GET /v3/serp/google/organic/task_get/advanced/{id}`. Its binding uses a **provider task ID**. A `resultId` identifies a **saved response**; a `jobId` identifies a **saved workflow**. Use each with its matching tool.

To fetch a saved result page:

```json
{
  "action": "read",
  "id": "RESULT_ID",
  "path": "/tasks/0/result/0/items",
  "offset": 0,
  "limit": 25
}
```

Continue with the returned offset for that same pointer. To resume work:

```json
{ "action": "resume", "id": "JOB_ID" }
```

Raw reads return base64 bytes. Concatenate decoded pages to reproduce the original response exactly; avoid converting large JSON integers through JavaScript Number when precision matters.
