import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "../src/client.js";

const login = "fixture@example.test";
const password = "páss:word/with+symbols=";
const encode = (value) => Buffer.from(value, "utf8").toString("base64");
const envKeys = [
  "DATAFORSEO_LOGIN",
  "DATAFORSEO_PASSWORD",
  "DATAFORSEO_PASSWORD_BASE64",
  "DATAFORSEO_AUTH_BASE64",
];
function cleanEnvironment(t) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  t.after(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test("plain, encoded-password and encoded-pair credentials send the same Basic header", async (t) => {
  cleanEnvironment(t);
  const configurations = [
    { login, password },
    { login, passwordBase64: encode(password) },
    { login, passwordBase64: encode(password).replace(/=+$/, "") },
    { authBase64: encode(login + ":" + password) },
    { authBase64: "Basic " + encode(login + ":" + password) },
  ];
  for (const config of configurations) {
    const client = new Client({ ...config, sandbox: true }, async (_url, options) => {
      assert.equal(options.headers.Authorization, "Basic " + encode(login + ":" + password));
      return new Response('{"status_code":20000,"tasks":[]}');
    });
    assert.deepEqual(client.credentials(), { login, password });
    await client.transport({ method: "GET", path: "/v3/serp/google/locations" });
  }
  const plainBase64Text = encode("this is the literal password");
  assert.equal(new Client({ login, password: plainBase64Text }).credentials().password, plainBase64Text);
});

test("environment Base64 modes work and an explicit config mode overrides environment credentials", (t) => {
  cleanEnvironment(t);
  process.env.DATAFORSEO_LOGIN = login;
  process.env.DATAFORSEO_PASSWORD_BASE64 = encode(password);
  assert.deepEqual(new Client().credentials(), { login, password });
  delete process.env.DATAFORSEO_PASSWORD_BASE64;
  process.env.DATAFORSEO_AUTH_BASE64 = encode(login + ":" + password);
  assert.deepEqual(new Client().credentials(), { login, password });
  process.env.DATAFORSEO_PASSWORD = "stale-environment-password";
  assert.deepEqual(new Client({ login, passwordBase64: encode(password) }).credentials(), { login, password });
  assert.throws(() => new Client().credentials(), /Choose only one/);
  assert.throws(() => new Client({ login, password, passwordBase64: encode(password) }).credentials(), /Choose only one/);
});

test("invalid encoded credentials fail before sending a request without exposing secret values", async (t) => {
  cleanEnvironment(t);
  for (const config of [
    { login, passwordBase64: "private!invalid" },
    { login, passwordBase64: "/w==" },
    { login, passwordBase64: encode("bad\npassword") },
    { authBase64: encode("missing-separator") },
    { authBase64: encode(":missing-login") },
    { authBase64: encode(login + ":") },
    { login: "another@example.test", authBase64: encode(login + ":" + password) },
  ]) {
    let calls = 0;
    const client = new Client(config, async () => { calls++; });
    await assert.rejects(client.transport({ method: "GET", path: "/v3/serp/google/locations" }), (error) => {
      for (const key of ["passwordBase64", "authBase64"])
        if (config[key]) assert.ok(!error.message.includes(config[key]));
      assert.ok(!error.message.includes(password));
      return true;
    });
    assert.equal(calls, 0);
  }
});

test("changing credential encoding preserves the shared account spending ledger", async (t) => {
  cleanEnvironment(t);
  const root = await mkdtemp(join(tmpdir(), "dataforseo-encoding-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  let paidCalls = 0;
  const fetcher = async (url) => {
    if (url.endsWith("/user_data")) return new Response(JSON.stringify({
      status_code: 20000,
      tasks: [{ status_code: 20000, result: [{ money: { statistics: { day: { value: new Date().toISOString().slice(0, 10), total: 0 } } } }] }],
    }));
    paidCalls++;
    return new Response('{"status_code":20000,"cost":1,"tasks":[]}');
  };
  const shared = { dataDirectory: root, dailyCapUsd: 1 };
  await new Client({ ...shared, login, password }, fetcher).request({ id: "POST /v3/serp/google/organic/live/advanced", body: [{}] });
  await assert.rejects(new Client({ ...shared, authBase64: encode(login + ":" + password) }, fetcher).request({ id: "POST /v3/serp/google/organic/live/advanced", body: [{}] }), /cap reached/);
  assert.equal(paidCalls, 1);
});
