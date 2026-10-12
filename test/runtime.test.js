import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { Client, spendingTotal } from "../src/client.js";
import { Store } from "../src/storage.js";
import { Imports } from "../src/imports.js";
import { catalogue, discover, inspect } from "../src/catalogue.js";

const LIVE = "POST /v3/serp/google/organic/live/advanced";
const POST = "POST /v3/serp/google/organic/task_post";
const GET = "GET /v3/serp/google/organic/task_get/advanced/{id}";
const date = () => new Date().toISOString().slice(0, 10);
const reply = (data) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status: 200,
  });
function account(spent = 0, day = date()) {
  return reply({
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            money: {
              statistics: {
                day: {
                  value: day,
                  serp: { total_live: spent, live: { desktop: spent } },
                },
              },
            },
          },
        ],
      },
    ],
  });
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "dataforseo-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    config: {
      login: "fixture-login",
      password: "fixture-password",
      dataDirectory: join(directory, "state"),
      dailyCapUsd: 1,
      requestTimeoutMs: 1000,
      pollIntervalMs: 2,
      workflowTimeoutMs: 500,
    },
  };
}

test("catalogue covers every menu and LLM page, field table and nested schema reference", async () => {
  const c = catalogue(),
    coverage = JSON.parse(
      await readFile(new URL("../data/coverage.json", import.meta.url)),
    );
  const manifest = JSON.parse(
    await readFile(
      new URL("../data/documentation-manifest.json", import.meta.url),
    ),
  );
  assert.equal(coverage.menuCovered, coverage.menuExpected);
  assert.equal(coverage.llmsCovered, coverage.llmsExpected);
  assert.deepEqual(coverage.missingMenu, []);
  assert.deepEqual(coverage.missingLlms, []);
  assert.equal(
    new Set(c.operations.map((x) => x.id)).size,
    c.operations.length,
  );
  assert.ok(c.operations.length >= 565);
  assert.equal(c.datasets.length, 16);
  assert.equal(c.guides.length, manifest.length);
  assert.equal(
    c.guides.reduce((sum, x) => sum + x.fields.length, 0),
    coverage.totalFieldRows,
  );
  const definitions = JSON.parse(
    await readFile(new URL("../data/schemas.json", import.meta.url)),
  );
  function references(value) {
    if (!value || typeof value !== "object") return;
    if (value.$ref)
      assert.ok(
        Object.hasOwn(
          definitions,
          value.$ref.replace("#/components/schemas/", ""),
        ),
        value.$ref,
      );
    for (const child of Object.values(value)) references(child);
  }
  references(definitions);
  references(c.operations);
  assert.ok(discover({ query: "votes_count", kind: "api" }).total > 0);
  assert.ok(inspect({ id: LIVE }).requestSchema);
  assert.ok(
    inspect({ schema: "SerpGoogleOrganicLiveAdvancedRequestInfo" })
      .totalProperties > 0,
  );
  for (const op of c.operations) {
    assert.match(op.path, /^\/v3\/[a-zA-Z0-9_/{}/.-]+$/);
    assert.ok(op.sources.length, op.id);
    for (const parameter of op.parameters)
      if (parameter.required !== undefined)
        assert.equal(typeof parameter.required, "boolean", op.id);
    if (op.path.includes("/live") || op.path.endsWith("/task_post"))
      assert.equal(op.paid, true, op.id);
  }
});

test("default $0 cap makes no paid or account requests; free metadata works", async (t) => {
  const { config } = await fixture(t);
  let calls = 0;
  const client = new Client({ ...config, dailyCapUsd: 0 }, async () => {
    calls++;
    return reply({ status_code: 20000, tasks: [] });
  });
  await assert.rejects(
    client.request({ id: LIVE, body: [{ keyword: "test" }] }),
    /disabled/,
  );
  assert.equal(calls, 0);
  await client.request({ id: "GET /v3/serp/google/locations" });
  assert.equal(calls, 1);
  await client.request({ id: "GET /v3/keywords_data/endpoints" });
  assert.equal(calls, 2);
  await assert.rejects(
    client.request({ id: POST, body: [{ keyword: "test" }] }),
    /disabled/,
  );
  assert.equal((await client.store.list("job"))[0].state, "blocked");
});

test("total account charges from other applications block paid calls", async (t) => {
  const { config } = await fixture(t);
  const methods = [];
  const client = new Client(config, async (_url, options) => {
    methods.push(options.method);
    return account(1.5);
  });
  await assert.rejects(client.request({ id: LIVE, body: [{}] }), /cap reached/);
  assert.deepEqual(methods, ["GET"]);
  assert.equal(
    spendingTotal({
      total_serp: 2,
      serp: { total_live: 2, live: { desktop: 2 } },
      keywords_data: { total_live: 3, live: 3 },
      value: date(),
    }),
    5,
  );
  assert.throws(() => spendingTotal({ serp: "unknown" }), /Invalid/);
});

test("soft cap permits the final call to exceed it, then stops even with lagging provider statistics", async (t) => {
  const { config } = await fixture(t);
  let paid = 0;
  const client = new Client(config, async (url) =>
    url.endsWith("/user_data")
      ? account(0.9)
      : (paid++,
        reply({
          status_code: 20000,
          cost: 0.2,
          tasks: [{ id: "a", status_code: 20000, cost: 0.2, result: [] }],
        })),
  );
  const first = await client.request({ id: LIVE, body: [{}] });
  assert.equal(first.summary.costUsd, 0.2);
  await assert.rejects(client.request({ id: LIVE, body: [{}] }), /cap reached/);
  assert.equal(paid, 1);
  assert.equal((await client.budget()).spentUsd, 1.1);
});

test("paid requests serialize across client instances sharing account storage", async (t) => {
  const { config } = await fixture(t);
  let paid = 0;
  const fetcher = async (url) => {
    if (url.endsWith("/user_data")) return account(0);
    paid++;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return reply({ status_code: 20000, cost: 1, tasks: [] });
  };
  const results = await Promise.allSettled([
    new Client(config, fetcher).request({ id: LIVE, body: [{}] }),
    new Client(config, fetcher).request({ id: LIVE, body: [{}] }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(paid, 1);
});

test("cannot verify spending, future dates, and failed account task block paid calls", async (t) => {
  const { config } = await fixture(t);
  for (const response of [
    reply({ status_code: 20000, tasks: [] }),
    account(0, "2999-01-01"),
  ]) {
    let calls = 0;
    const client = new Client(config, async () => {
      calls++;
      return response;
    });
    await assert.rejects(client.request({ id: LIVE, body: [{}] }));
    assert.equal(calls, 1);
  }
});

test("preserves unknown request fields and every original response byte, with field and array paging", async (t) => {
  const { config } = await fixture(t);
  let sent;
  const raw =
    ' {"status_code":20000,"cost":0,"future":{"huge":9007199254740993,"a/b":{"~key":[1,2,3]}},"tasks":[]}\n';
  const client = new Client(
    { ...config, sandbox: true },
    async (url, options) => {
      assert.ok(url.startsWith("https://sandbox.dataforseo.com/v3/"));
      assert.equal(options.redirect, "error");
      sent = JSON.parse(options.body);
      return reply(raw);
    },
  );
  const body = [
    { keyword: "example", future_option: { enabled: false, value: null } },
  ];
  const result = await client.request({ id: LIVE, body });
  assert.deepEqual(sent, body);
  const saved = await client.store.result({ id: result.resultId, raw: true });
  assert.equal(Buffer.from(saved.data, "base64").toString(), raw);
  const field = await client.store.result({
    id: result.resultId,
    path: "/future/a~1b/~0key",
    offset: 1,
    limit: 1,
  });
  assert.deepEqual(field.value, [2]);
  assert.equal(field.nextOffset, 2);
  assert.equal(
    await readFile(client.store.path(result.resultId, "raw"), "utf8"),
    raw,
  );
  await client.store.delete(result.resultId);
  await assert.rejects(client.store.get(result.resultId), /ENOENT/);
});

test("task timeout and new client resume fetch existing IDs without reposting or requiring paid cap", async (t) => {
  const { config } = await fixture(t);
  let posts = 0,
    ready = false,
    gets = 0;
  const fetcher = async (url, options) => {
    if (url.endsWith("/user_data")) return account();
    if (options.method === "POST") {
      posts++;
      return reply({
        status_code: 20000,
        cost: 0.01,
        tasks: [{ id: "provider-task", status_code: 20100 }],
      });
    }
    gets++;
    return reply({
      status_code: 20000,
      cost: 0,
      tasks: [
        {
          id: "provider-task",
          status_code: ready ? 20000 : 40602,
          result: ready ? [{ items: [{ new_field: "kept" }] }] : null,
        },
      ],
    });
  };
  const client = new Client({ ...config, workflowTimeoutMs: 20 }, fetcher),
    initial = await client.request({ id: POST, body: [{ keyword: "test" }] });
  assert.equal(initial.state, "pending");
  assert.ok(gets > 0);
  assert.equal(posts, 1);
  ready = true;
  const resumed = await new Client(
    { ...config, dailyCapUsd: 0 },
    fetcher,
  ).resume(initial.jobId);
  assert.equal(resumed.state, "complete");
  assert.equal(posts, 1);
  const last = (await client.store.get(initial.jobId)).lastResultId;
  assert.deepEqual(
    (await client.store.result({ id: last, path: "/tasks/0/result/0/items" }))
      .value,
    [{ new_field: "kept" }],
  );
});

test("uncertain submission is saved and never replayed; existing task IDs can be tracked", async (t) => {
  const { config } = await fixture(t);
  let posts = 0;
  const client = new Client(config, async (url, options) => {
    if (url.endsWith("/user_data")) return account();
    if (options.method === "POST") {
      posts++;
      throw new Error("Connection lost");
    }
    return reply({
      status_code: 20000,
      tasks: [{ id: "existing", status_code: 20000, result: [] }],
    });
  });
  await assert.rejects(client.request({ id: POST, body: [{}] }), /job ID/);
  const job = (await client.store.list("job"))[0];
  assert.equal(job.state, "submission-uncertain");
  await client.resume(job.id);
  assert.equal(posts, 1);
  const tracked = await client.track({ endpoint: POST, taskIds: ["existing"] });
  assert.equal((await client.resume(tracked.id)).state, "complete");
  assert.equal(posts, 1);
});

test("OnPage waits for crawl completion even when summary status is successful", async (t) => {
  const { config } = await fixture(t);
  let count = 0;
  const client = new Client(
    { ...config, sandbox: true },
    async (_url, options) =>
      options.method === "POST"
        ? reply({
            status_code: 20000,
            tasks: [{ id: "crawl", status_code: 20100 }],
          })
        : reply({
            status_code: 20000,
            tasks: [
              {
                id: "crawl",
                status_code: 20000,
                result: [
                  { crawl_progress: ++count < 2 ? "in_progress" : "finished" },
                ],
              },
            ],
          }),
  );
  const result = await client.request({
    id: "POST /v3/on_page/task_post",
    body: [{ target: "example.org", max_crawl_pages: 1 }],
  });
  assert.equal(result.state, "complete");
  assert.equal(count, 2);
});

test("collectors preserve IDs and remain resumable when HTTP or overall API status is unsuccessful", async (t) => {
  const { config } = await fixture(t);
  for (const failure of [
    { httpStatus: 503, statusCode: 20000 },
    { httpStatus: 200, statusCode: 50000 },
  ]) {
    let ready = false;
    const client = new Client(
      { ...config, sandbox: true, workflowTimeoutMs: 20 },
      async () =>
        new Response(
          JSON.stringify({
            status_code: ready ? 20000 : failure.statusCode,
            tasks: [{ status_code: 20000, result: [{ items: [] }] }],
          }),
          { status: ready ? 200 : failure.httpStatus },
        ),
    );
    const job = await client.track({ endpoint: POST, taskIds: ["existing"] });
    assert.equal((await client.resume(job.id)).state, "pending");
    const pending = await client.store.get(job.id);
    assert.deepEqual(pending.completedTaskIds, []);
    assert.ok(pending.lastResultId);
    ready = true;
    assert.equal((await client.resume(job.id)).state, "complete");
  }
});

test("OnPage keeps an incomplete or missing crawl progress resumable", async (t) => {
  const { config } = await fixture(t);
  for (const progress of [undefined, "queued", "in_progress"]) {
    let ready = false;
    const client = new Client(
      { ...config, sandbox: true, workflowTimeoutMs: 20 },
      async () =>
        reply({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [{ crawl_progress: ready ? "finished" : progress }],
            },
          ],
        }),
    );
    const job = await client.track({
      endpoint: "POST /v3/on_page/task_post",
      taskIds: ["crawl"],
    });
    assert.equal((await client.resume(job.id)).state, "pending");
    ready = true;
    assert.equal((await client.resume(job.id)).state, "complete");
  }
});

test("cancelled workflow persists progress and resumes; terminal provider errors are preserved", async (t) => {
  const { config } = await fixture(t);
  const controller = new AbortController();
  let terminal = false;
  const client = new Client(
    { ...config, sandbox: true },
    async (_url, options) => {
      if (options.method === "POST")
        return reply({
          status_code: 20000,
          tasks: [
            { id: "one", status_code: 20100 },
            { id: "two", status_code: 20100 },
          ],
        });
      if (!terminal) controller.abort();
      return reply({
        status_code: 20000,
        tasks: [
          {
            status_code: terminal ? 40400 : 40602,
            status_message: terminal ? "Expired" : "Queued",
            result: null,
          },
        ],
      });
    },
  );
  const first = await client.request(
    { id: POST, body: [{}, {}] },
    controller.signal,
  );
  assert.equal(first.state, "pending");
  terminal = true;
  const result = await client.resume(first.jobId);
  assert.equal(result.state, "failed");
  assert.equal(
    (await client.store.get(first.jobId)).completedTaskIds.length,
    2,
  );
});

test("fixed API hosts, catalogue-only routes and encoded path bindings prevent arbitrary credential destinations", async (t) => {
  const { config } = await fixture(t);
  let url;
  const client = new Client({ ...config, sandbox: true }, async (input) => {
    url = input;
    return reply({ status_code: 20000, tasks: [] });
  });
  await assert.rejects(
    client.request({ id: "GET https://example.org" }),
    /Unknown endpoint/,
  );
  await assert.rejects(
    client.request({ id: GET, bindings: { id: ".." } }),
    /invalid/,
  );
  await client.request({ id: GET, bindings: { id: "abc/../../?host=evil" } });
  assert.equal(new URL(url).host, "sandbox.dataforseo.com");
  assert.ok(url.includes("%2F"));
  await assert.rejects(
    client.request({ id: GET, body: [{}], bindings: { id: "task" } }),
    /GET requests/,
  );
});

test("oversized selections are retained and accessible as exact raw byte pages", async (t) => {
  const { config } = await fixture(t),
    store = new Store(config.dataDirectory),
    raw = JSON.stringify({ html: "x".repeat(193000), unknown: false });
  const id = await store.save(raw, {});
  await assert.rejects(store.result({ id, path: "/html" }), /display size/);
  const chunks = [];
  let byteOffset = 0;
  do {
    const part = await store.result({
      id,
      raw: true,
      byteOffset,
      byteLength: 24000,
    });
    chunks.push(Buffer.from(part.data, "base64"));
    byteOffset = part.nextByteOffset;
  } while (byteOffset !== null);
  assert.equal(Buffer.concat(chunks).toString(), raw);
});

test("database references stream JSON arrays, nested arrays, JSONL/gzip and CSV without copying originals", async (t) => {
  const { directory, config } = await fixture(t),
    store = new Store(config.dataDirectory),
    imports = new Imports(store, [directory]);
  const files = [
    [
      "array.json",
      JSON.stringify([
        { n: 1, future: null },
        { n: 2, future: false },
        { n: 3 },
      ]),
      "json",
      "",
    ],
    [
      "wrapped.json",
      JSON.stringify({ wrapper: { "a.b": [{ n: 1 }, { n: 2 }, { n: 3 }] } }),
      "json",
      "/wrapper/a.b",
    ],
    ["rows.jsonl.gz", gzipSync('{"n":1}\n{"n":2}\n{"n":3}\n'), "jsonl", ""],
    [
      "rows.csv",
      'n,note\r\n1,"hello\nworld"\r\n2,"a,b"\r\n3,last\r\n',
      "csv",
      "",
    ],
  ];
  for (const [name, contents, format, itemPath] of files) {
    const file = join(directory, name);
    await writeFile(file, contents);
    const before = await readFile(file);
    const item = await imports.register({
      dataset: "google/keywords",
      file,
      format,
      itemPath,
    });
    const result = await imports.read({
      id: item.id,
      offset: 1,
      limit: 1,
      path: "/n",
    });
    assert.deepEqual(result.records, [format === "csv" ? "2" : 2]);
    assert.equal(result.nextOffset, 2);
    assert.deepEqual(await readFile(file), before);
    await store.delete(item.id);
    assert.deepEqual(await readFile(file), before);
  }
  assert.equal((await store.list("import")).length, 0);
});

test("import roots reject symlinks outside allowed directories and detect changed files", async (t) => {
  const { directory, config } = await fixture(t),
    other = await mkdtemp(join(tmpdir(), "dataforseo-outside-"));
  t.after(() => rm(other, { recursive: true, force: true }));
  const store = new Store(config.dataDirectory),
    imports = new Imports(store, [directory]),
    outside = join(other, "secret.json");
  await writeFile(outside, "[1]");
  await symlink(outside, join(directory, "link.json"));
  await assert.rejects(
    imports.register({
      dataset: "google/keywords",
      file: join(directory, "link.json"),
    }),
    /outside/,
  );
  await assert.rejects(
    new Imports(store).register({ dataset: "google/keywords", file: outside }),
    /outside/,
  );
  const file = join(directory, "owned.json");
  await writeFile(file, "[1]");
  const item = await imports.register({ dataset: "google/keywords", file });
  await writeFile(file, "[1,2]");
  await assert.rejects(imports.read({ id: item.id }), /changed/);
});
