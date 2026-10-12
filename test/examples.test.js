import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import plugin from "../src/index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import { catalogue, endpoint } from "../src/catalogue.js";

test("published prompt scenarios resolve to current catalogue operations and native tool references", async () => {
  const cases = JSON.parse(
    await readFile(new URL("../eval/cases.json", import.meta.url)),
  );
  assert.equal(new Set(cases.map((x) => x.id)).size, cases.length);
  for (const item of cases) {
    if (item.expectedEndpoint) {
      const operation = endpoint(item.expectedEndpoint);
      assert.equal(operation.legacy || false, false);
      assert.ok(operation.requestSchema);
    }
    if (item.expectedDataset)
      assert.ok(
        catalogue().datasets.some((x) => x.id === item.expectedDataset),
      );
  }
  const toolNames = new Set(
    getToolPluginMetadata(plugin).tools.map((x) => x.name),
  );
  const identifiers = new Set([
    ...toolNames,
    ...catalogue().operations.map((x) => x.family),
  ]);
  for (const path of [
    "../skills/dataforseo/SKILL.md",
    "../skills/dataforseo/references/routing.md",
  ]) {
    const text = await readFile(new URL(path, import.meta.url), "utf8");
    for (const match of text.matchAll(/`(dataforseo_[a-z]+)`/g))
      assert.ok(identifiers.has(match[1]), match[1]);
  }
});
