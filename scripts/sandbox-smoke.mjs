import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Client } from "../src/client.js";

const root = resolve(process.argv[2] || "sandbox-results");
const client = new Client({
  sandbox: true,
  dailyCapUsd: 0,
  dataDirectory: join(root, "responses"),
  workflowTimeoutMs: 60000,
});
try {
  client.credentials();
} catch (error) {
  console.error(
    error.message + ". Set DATAFORSEO_LOGIN with DATAFORSEO_PASSWORD or DATAFORSEO_PASSWORD_BASE64, or set DATAFORSEO_AUTH_BASE64. This runner uses only sandbox.dataforseo.com and makes no paid calls.",
  );
  process.exit(2);
}
await mkdir(root, { recursive: true, mode: 0o700 });
const report = {
  testedAt: new Date().toISOString(),
  host: "sandbox.dataforseo.com",
  paidCalls: 0,
  checks: [],
};
try {
  for (const request of [
    {
      id: "POST /v3/serp/google/organic/live/advanced",
      body: [
        {
          language_code: "en",
          location_code: 2840,
          keyword: "albert einstein",
        },
      ],
    },
    {
      id: "POST /v3/dataforseo_labs/google/keyword_overview/live",
      body: [
        { language_code: "en", location_code: 2840, keywords: ["dataforseo"] },
      ],
    },
    {
      id: "POST /v3/serp/google/organic/task_post",
      body: [
        {
          language_code: "en",
          location_code: 2840,
          keyword: "albert einstein",
        },
      ],
    },
  ]) {
    const result = await client.request(request);
    const metadata = await client.store.get(result.resultId);
    report.checks.push({
      endpoint: request.id,
      ...result,
      completeResponseBytes: metadata.bytes,
    });
    if (
      result.summary.httpStatus !== 200 ||
      result.summary.statusCode !== 20000
    )
      throw new Error(
        "Sandbox request failed for " +
          request.id +
          "; complete response is saved",
      );
    if (result.summary.tasks.some((x) => x.statusCode >= 40000))
      throw new Error(
        "Sandbox task returned an error; complete response is saved",
      );
    if (result.jobId && result.state !== "complete")
      throw new Error(
        "Sandbox task workflow did not complete; job ID is saved for inspection or resume",
      );
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  process.exitCode = 1;
}
await writeFile(
  join(root, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    report: join(root, "report.json"),
    host: report.host,
    paidCalls: 0,
  }),
);
