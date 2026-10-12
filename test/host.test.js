import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../src/index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { Store } from "../src/storage.js";

test("native OpenClaw registration exposes seven tools and exercises catalogue, schemas and durable results", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dataforseo-host-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tools = new Map();
  plugin.register({
    pluginConfig: { dataDirectory: root },
    registerTool: (tool) => tools.set(tool.name, tool),
  });
  assert.equal(tools.size, 7);
  assert.equal(getToolPluginMetadata(plugin).id, "dataforseo");
  const result = await tools
    .get("dataforseo_catalogue")
    .execute("catalogue-test", { query: "google organic live advanced" });
  const match = result.details.items.find(
    (x) => x.id === "POST /v3/serp/google/organic/live/advanced",
  );
  assert.ok(match);
  const schema = await tools
    .get("dataforseo_schema")
    .execute("schema-test", { id: match.id });
  assert.ok(schema.details.requestSchema);
  const list = await tools
    .get("dataforseo_results")
    .execute("results-test", { action: "list" });
  assert.equal(list.details.total, 0);
  const jobs = await tools
    .get("dataforseo_jobs")
    .execute("jobs-test", { action: "list" });
  assert.equal(jobs.details.total, 0);
  const manifest = JSON.parse(
    await readFile(new URL("../openclaw.plugin.json", import.meta.url)),
  );
  assert.deepEqual(
    manifest.configContracts.secretInputs.paths.map((x) => x.path),
    ["login", "password", "passwordBase64", "authBase64"],
  );
  assert.equal(manifest.uiHints.password.sensitive, true);
  assert.equal(manifest.uiHints.login.sensitive, true);
  assert.equal(manifest.uiHints.passwordBase64.sensitive, true);
  assert.equal(manifest.uiHints.authBase64.sensitive, true);
  for (const field of ["login", "password", "passwordBase64", "authBase64"]) {
    assert.equal(manifest.configSchema.properties[field].type, "string");
    assert.equal(manifest.configSchema.properties[field].anyOf, undefined);
  }
  assert.deepEqual(manifest.skills, ["./skills"]);
  const skill = await readFile(
    new URL("../skills/dataforseo/SKILL.md", import.meta.url),
    "utf8",
  );
  assert.match(skill, /^---\nname: dataforseo\n/);
});

test("the results tool deletes only responses and preserves spending, jobs, and database references", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "dataforseo-delete-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tools = new Map();
  plugin.register({
    pluginConfig: { dataDirectory: root },
    registerTool: (tool) => tools.set(tool.name, tool),
  });
  const store = new Store(root);
  const results = tools.get("dataforseo_results");
  for (const [id, record] of [
    ["budget-test", { day: "2026-10-12", spentUsd: 1 }],
    ["job-test", { kind: "job", taskIds: ["existing"] }],
    ["import-test", { kind: "import", file: "/original.json" }],
  ]) {
    await store.put(id, record);
    await assert.rejects(
      results.execute("delete-test", { action: "delete", id }),
      /not an API response/,
    );
    assert.deepEqual(await store.get(id), record);
  }
  const id = await store.save('{"complete":true}', {});
  const deleted = await results.execute("delete-response", {
    action: "delete",
    id,
  });
  assert.equal(deleted.details.deleted, id);
  await assert.rejects(store.get(id), /ENOENT/);
});
