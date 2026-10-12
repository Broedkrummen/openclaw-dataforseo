import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Client } from "./client.js";
import { discover, inspect } from "./catalogue.js";
import { Imports } from "./imports.js";

const choice = (...values) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const text = (description) => Type.Optional(Type.String({ description }));
const offset = () =>
  Type.Optional(
    Type.Integer({
      minimum: 0,
      description: "Zero-based page offset. Continue with nextOffset.",
    }),
  );
const limit = () =>
  Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Maximum entries in this page, 1–100.",
    }),
  );
const secret = () =>
  Type.Optional(
    Type.Union([
      Type.String(),
      Type.Object({
        source: Type.String(),
        provider: Type.String(),
        id: Type.String(),
      }),
    ]),
  );
const resultParameters = {
  id: text(
    "Saved response or import ID; required for read, delete, or detach.",
  ),
  path: text(
    "JSON Pointer. API example: /tasks/0/result/0/items. Database reads apply it to each record. Escape / as ~1 and ~ as ~0.",
  ),
  offset: offset(),
  limit: limit(),
  raw: Type.Optional(
    Type.Boolean({
      description:
        "Return original bytes as base64 instead of parsed fields. Default false.",
    }),
  ),
  byteOffset: Type.Optional(
    Type.Integer({
      minimum: 0,
      description:
        "Original-file byte offset; default 0. Continue with nextByteOffset.",
    }),
  ),
  byteLength: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 24000,
      description: "Bytes per raw page; default 12000, maximum 24000.",
    }),
  ),
};
function page(items, { offset = 0, limit = 25 }) {
  return {
    total: items.length,
    items: items.slice(offset, offset + limit),
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}
function requiredId(params) {
  if (!params.id) throw new Error("An ID is required for this action");
}

export default defineToolPlugin({
  id: "dataforseo",
  name: "DataForSEO",
  description:
    "Search the complete DataForSEO catalogue, load fields on demand, run APIs, resume tasks, and read complete saved results and purchased databases.",
  configSchema: Type.Object(
    {
      login: secret(),
      password: secret(),
      passwordBase64: secret(),
      authBase64: secret(),
      dailyCapUsd: Type.Optional(
        Type.Number({
          minimum: 0,
          description:
            "Daily total DataForSEO account spending cap in USD. Default 0 disables paid calls. A final request can exceed the cap.",
        }),
      ),
      dataDirectory: Type.Optional(
        Type.String({
          description:
            "Private directory for complete responses and job records. Default ~/.openclaw/dataforseo. No automatic expiry.",
        }),
      ),
      sandbox: Type.Optional(
        Type.Boolean({
          description: "Use free provider sandbox fixtures. Default false.",
        }),
      ),
      requestTimeoutMs: Type.Optional(
        Type.Integer({ minimum: 1000, maximum: 600000 }),
      ),
      workflowTimeoutMs: Type.Optional(
        Type.Integer({ minimum: 1000, maximum: 3600000 }),
      ),
      pollIntervalMs: Type.Optional(
        Type.Integer({ minimum: 1000, maximum: 60000 }),
      ),
      importRoots: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Directories agents may import purchased database files from. Default [] disables file imports.",
        }),
      ),
    },
    { additionalProperties: false },
  ),
  tools: (tool) => [
    tool({
      name: "dataforseo_catalogue",
      label: "DataForSEO Catalogue",
      description:
        "Find API endpoint IDs, bulk database IDs, or documentation guides. Search matches paths and all documented field names. Use dataforseo_schema for nested schemas and field pages.",
      parameters: Type.Object({
        query: text(
          "Space-separated words; all must match. Example: google organic live advanced.",
        ),
        family: text(
          "Optional API family, such as serp, keywords_data, dataforseo_labs, or backlinks.",
        ),
        kind: Type.Optional(choice("api", "dataset", "guide")),
        offset: offset(),
        limit: limit(),
      }),
      execute: (params) => discover(params),
    }),
    tool({
      name: "dataforseo_schema",
      label: "DataForSEO Schema",
      description:
        "Load one endpoint, database, or documentation guide and its field page. Follow requestSchema/responseSchema $refs by passing schema to retrieve any of the nested OpenAPI definitions. Documented literals are examples or constraints; conditional requirements remain provider validated.",
      parameters: Type.Object({
        id: text(
          "Exact endpoint, dataset, or doc: guide ID from the catalogue. Omit when requesting schema.",
        ),
        schema: text(
          "Definition name or #/components/schemas/... $ref from a prior schema call. Omit when requesting id.",
        ),
        offset: offset(),
        limit: limit(),
      }),
      execute: (params) => inspect(params),
    }),
    tool({
      name: "dataforseo_request",
      label: "DataForSEO Request",
      description:
        "Execute a catalogue endpoint after checking its schema. Saves the entire response; returns resultId and a status/count summary, not the dataset. task_post collects automatically and returns jobId. Paid calls check the operator's account cap. Resume interrupted jobs; never replay an uncertain submission.",
      parameters: Type.Object({
        id: Type.String({
          description:
            "Exact catalogue ID including METHOD, for example POST /v3/serp/google/organic/live/advanced.",
        }),
        body: Type.Optional(
          Type.Unknown({
            description:
              "Complete provider JSON payload, usually a task array; inspect requestSchema. Omit for GET. Unknown optional fields pass through.",
          }),
        ),
        bindings: Type.Optional(
          Type.Record(
            Type.String(),
            Type.Union([Type.String(), Type.Number()]),
            {
              description:
                'Path placeholders to unencoded provider values, such as {"id":"PROVIDER_TASK_ID"} or {"country":"US"}. These are not saved response IDs.',
            },
          ),
        ),
        wait: Type.Optional(
          Type.Boolean({
            description:
              "For task_post, automatically collect results (default true). False returns after submission.",
          }),
        ),
        format: Type.Optional(
          Type.Union([Type.Literal("json"), Type.Literal("ai")], {
            description:
              "Default json preserves all fields. ai is the provider's cropped/rounded format; use only when requested and supported.",
          }),
        ),
      }),
      execute: (params, config, context) =>
        new Client(config).request(params, context.signal),
    }),
    tool({
      name: "dataforseo_results",
      label: "DataForSEO Results",
      description:
        "List, read, or explicitly delete saved API responses. Use a JSON Pointer to select any field, with offset/limit for arrays. raw=true reads original UTF-8 bytes as base64, preserving exact numbers and large values. Results stay until explicitly deleted.",
      parameters: Type.Object({
        action: choice("list", "read", "delete"),
        ...resultParameters,
      }),
      execute: async (params, config) => {
        const store = new Client(config).store;
        if (params.action === "list")
          return page(await store.list("response"), params);
        requiredId(params);
        if (params.action === "delete") {
          const item = await store.get(params.id);
          if (item.kind !== "response")
            throw new Error("ID is not an API response");
          return store.delete(params.id);
        }
        return store.result(params);
      },
    }),
    tool({
      name: "dataforseo_jobs",
      label: "DataForSEO Jobs",
      description:
        "Recover work: status inspects a saved job; resume fetches existing tasks without posting again. track registers known provider task IDs recovered through ID List or created elsewhere. Pending and submission-uncertain states are not successful completion.",
      parameters: Type.Object({
        action: choice("list", "status", "resume", "track"),
        id: text(
          "Saved jobId, required for status/resume. Provider task IDs instead belong in taskIds for track.",
        ),
        offset: offset(),
        limit: limit(),
        endpoint: text("For track only: exact original task_post endpoint ID."),
        taskIds: Type.Optional(
          Type.Array(Type.String(), {
            minItems: 1,
            maxItems: 1000,
            description:
              "For track only: existing provider task IDs. Tracking never submits another task.",
          }),
        ),
      }),
      execute: async (params, config, context) => {
        const client = new Client(config);
        if (params.action === "list")
          return page(await client.store.list("job"), params);
        if (params.action === "track") return client.track(params);
        requiredId(params);
        if (params.action === "resume")
          return client.resume(params.id, context.signal);
        const job = await client.store.get(params.id);
        if (job.kind !== "job")
          throw new Error("ID is not an asynchronous job");
        return job;
      },
    }),
    tool({
      name: "dataforseo_budget",
      label: "DataForSEO Budget",
      description:
        "Read current total DataForSEO account spending for the UTC day, including other applications, and the configured daily cap. The cap defaults to 0. Requests stop after the cap is reached; the final paid request can exceed it.",
      parameters: Type.Object({}),
      execute: (_params, config, context) =>
        new Client(config).budget(context.signal),
    }),
    tool({
      name: "dataforseo_databases",
      label: "DataForSEO Databases",
      description:
        "Browse purchased dataset catalogue and schemas; register a reference to an operator file inside importRoots; stream pages from JSON, JSONL, CSV, or gzip files. Original files are kept in place. itemPath selects a JSON array in a wrapper; path selects a field within each record. detach removes only the reference. raw returns original file bytes, compressed for gzip.",
      parameters: Type.Object({
        action: choice(
          "catalogue",
          "schema",
          "import",
          "list",
          "read",
          "detach",
        ),
        ...resultParameters,
        dataset: text(
          "Dataset ID from the database catalogue; required for import and usable for schema.",
        ),
        file: text(
          "For import: original absolute file path inside configured importRoots. A .gz suffix enables gzip.",
        ),
        format: Type.Optional(
          Type.Union(
            [Type.Literal("json"), Type.Literal("jsonl"), Type.Literal("csv")],
            {
              description:
                "Original file format for import; default json. CSV needs a header. Gzip does not change this choice.",
            },
          ),
        ),
        itemPath: text(
          "For import: JSON Pointer to an array inside a wrapper, such as /data/items. Omit for a root array or records.",
        ),
        query: text(
          "For catalogue: space-separated words that must all match.",
        ),
      }),
      execute: async (params, config, context) => {
        const client = new Client(config),
          imports = new Imports(client.store, config.importRoots);
        if (params.action === "catalogue")
          return discover({ ...params, kind: "dataset" });
        if (params.action === "schema")
          return inspect({ ...params, id: params.dataset || params.id });
        if (params.action === "list")
          return page(await client.store.list("import"), params);
        if (params.action === "import") {
          if (!params.dataset || !params.file)
            throw new Error("dataset and file are required");
          return imports.register(params);
        }
        requiredId(params);
        if (params.action === "read")
          return imports.read(params, context.signal);
        const item = await client.store.get(params.id);
        if (item.kind !== "import")
          throw new Error("ID is not an imported database");
        return client.store.delete(params.id);
      },
    }),
  ],
});
