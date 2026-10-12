import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "../src/client.js";
import { fixtureSecret } from "./fixtures.js";

const ACCOUNT = { method: "GET", path: "/v3/appendix/user_data" };
const LIVE = "POST /v3/serp/google/organic/live/advanced";
const reply = (data, options) => new Response(JSON.stringify(data), options);
const limited = () => reply({
  status_code: 20000,
  tasks: [{ status_code: 40202, status_message: "The rates limit per minute has been exceeded: 6 >= 6.", result: null }],
});
const account = (spent = 0) => reply({
  status_code: 20000,
  tasks: [{ status_code: 20000, result: [{ money: { statistics: { day: { value: new Date().toISOString().slice(0, 10), total: spent } } } }] }],
});
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "dataforseo-account-rate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let now = Date.now();
  const waits = [];
  const clock = {
    now: () => now,
    wait: async (ms, signal) => {
      signal?.throwIfAborted();
      waits.push(ms);
      now += ms;
    },
  };
  return { config: { login: "fixture-user", password: fixtureSecret(), dataDirectory: root, dailyCapUsd: 1 }, clock, waits };
}

test("twelve concurrent account reads share six-per-minute pacing across clients and credential formats", async (t) => {
  const { config, clock } = await fixture(t);
  const starts = [];
  const fetcher = async () => {
    const now = clock.now();
    assert.ok(starts.filter((at) => now - at < 60000).length < 6);
    starts.push(now);
    return account();
  };
  const encoded = { ...config, password: undefined, authBase64: Buffer.from(config.login + ":" + config.password).toString("base64") };
  await Promise.all(Array.from({ length: 12 }, (_, i) => new Client(i % 2 ? encoded : config, fetcher, clock).transport(ACCOUNT)));
  assert.equal(starts.length, 12);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 10050);
});

test("provider task rate limits wait, save the rejected response, and read fresh spending before sending once", async (t) => {
  const { config, clock, waits } = await fixture(t);
  let reads = 0, posts = 0;
  const client = new Client(config, async (_url, options) => {
    if (options.method === "GET") return ++reads === 1 ? limited() : account(0.25);
    posts++;
    return reply({ status_code: 20000, cost: 0.1, tasks: [] });
  }, clock);
  await client.request({ id: LIVE, body: [{}] });
  assert.equal(reads, 2);
  assert.equal(posts, 1);
  assert.ok(waits[0] >= 60500);
  const saved = await client.store.list("response");
  assert.equal(saved.filter((record) => record.summary.rateLimited).length, 1);
  assert.equal((await new Client(config, async () => account(0.9), clock).budget()).spentUsd, 0.9);
});

test("HTTP 429 honors Retry-After and never retries a paid POST", async (t) => {
  const { config, clock, waits } = await fixture(t);
  let reads = 0, posts = 0;
  const client = new Client(config, async (_url, options) => {
    if (options.method === "GET") return ++reads === 1
      ? reply({ status_code: 40202 }, { status: 429, headers: { "Retry-After": "120" } })
      : account();
    posts++;
    return reply({ status_code: 40202, tasks: [] }, { status: 429 });
  }, clock);
  const result = await client.request({ id: LIVE, body: [{}] });
  assert.equal(result.summary.httpStatus, 429);
  assert.equal(reads, 2);
  assert.equal(posts, 1);
  assert.equal(waits[0], 120000);
});

test("account cooldown persists when a new client resumes after the retry budget is exhausted", async (t) => {
  const { config, clock, waits } = await fixture(t);
  let reads = 0, posts = 0;
  const fetcher = async (_url, options) => {
    if (options.method !== "GET") { posts++; throw new Error("Paid call must remain blocked"); }
    reads++;
    return limited();
  };
  await assert.rejects(new Client(config, fetcher, clock).request({ id: LIVE, body: [{}] }), /Cannot verify/);
  assert.equal(reads, 3);
  assert.equal(posts, 0);
  const next = new Client(config, async () => account(), clock);
  await next.budget();
  assert.equal(waits.length, 3);
  assert.ok(waits.every((ms) => ms >= 60500));
});

test("cancelling an account wait keeps task submission blocked and releases both account locks", async (t) => {
  const { config, clock } = await fixture(t);
  let requests = 0;
  const fetcher = async () => { requests++; return account(); };
  await new Client(config, fetcher, clock).budget();
  const controller = new AbortController();
  const cancelledClock = { now: clock.now, wait: async () => { controller.abort(); controller.signal.throwIfAborted(); } };
  const client = new Client(config, fetcher, cancelledClock);
  await assert.rejects(client.request({ id: "POST /v3/serp/google/organic/task_post", body: [{}] }, controller.signal), /abort/i);
  assert.equal(requests, 1);
  assert.equal((await client.store.list("job"))[0].state, "blocked");
  await new Client(config, fetcher, clock).budget();
  assert.equal(requests, 2);
});

test("spending that reaches the cap while rate limited prevents the paid call after recovery", async (t) => {
  const { config, clock } = await fixture(t);
  let reads = 0, posts = 0;
  const client = new Client(config, async (_url, options) => {
    if (options.method !== "GET") { posts++; throw new Error("Paid call must remain blocked"); }
    return ++reads === 1 ? limited() : account(1.5);
  }, clock);
  await assert.rejects(client.request({ id: LIVE, body: [{}] }), /cap reached/);
  assert.equal(reads, 2);
  assert.equal(posts, 0);
});
