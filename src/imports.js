import { realpath, stat, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { relative, isAbsolute, sep } from "node:path";
import { createGunzip } from "node:zlib";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse";
import chain from "stream-chain";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { streamValues } from "stream-json/streamers/stream-values.js";
import { catalogue } from "./catalogue.js";

export function pointer(value, path = "") {
  if (path && !path.startsWith("/"))
    throw new Error("Use a JSON Pointer starting with /");
  for (const part of path ? path.slice(1).split("/") : []) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      throw new Error("JSON Pointer does not exist in a record");
    value = value[key];
  }
  return value;
}
export class Imports {
  constructor(store, roots = []) {
    this.store = store;
    this.roots = roots;
  }
  async allowed(file) {
    const actual = await realpath(file);
    for (const root of this.roots) {
      const parent = await realpath(root),
        path = relative(parent, actual);
      if (
        path !== "" &&
        !path.startsWith(".." + sep) &&
        path !== ".." &&
        !isAbsolute(path)
      )
        return actual;
    }
    throw new Error(
      "File is outside configured importRoots. Configure a directory containing your purchased database files.",
    );
  }
  async register({ dataset, file, format = "json", itemPath = "" }) {
    if (!catalogue().datasets.some((x) => x.id === dataset))
      throw new Error("Unknown database dataset ID");
    if (!["json", "jsonl", "csv"].includes(format))
      throw new Error("Unsupported database format");
    if (itemPath && !itemPath.startsWith("/"))
      throw new Error("itemPath must be a JSON Pointer to an array");
    const source = await this.allowed(file),
      info = await stat(source);
    if (!info.isFile()) throw new Error("Import must reference a regular file");
    const item = {
      id: randomUUID(),
      kind: "import",
      createdAt: new Date().toISOString(),
      dataset,
      file: source,
      format,
      itemPath,
      gzip: source.endsWith(".gz"),
      bytes: info.size,
      mtimeMs: info.mtimeMs,
    };
    await this.store.put(item.id, item);
    return item;
  }
  async source(id) {
    const item = await this.store.get(id);
    if (item.kind !== "import")
      throw new Error("ID is not an imported database");
    const file = await this.allowed(item.file),
      info = await stat(file);
    if (
      file !== item.file ||
      info.size !== item.bytes ||
      info.mtimeMs !== item.mtimeMs
    )
      throw new Error(
        "Original database file changed. Import it again to create a new reference.",
      );
    return item;
  }
  async read(
    {
      id,
      offset = 0,
      limit = 25,
      path = "",
      raw = false,
      byteOffset = 0,
      byteLength = 12000,
    },
    signal,
  ) {
    const item = await this.source(id);
    signal?.throwIfAborted();
    if (raw) {
      const handle = await open(item.file, "r");
      try {
        const buffer = Buffer.alloc(Math.min(byteLength, 24000));
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          byteOffset,
        );
        return {
          id,
          encoding: "base64",
          compressed: item.gzip,
          data: buffer.subarray(0, bytesRead).toString("base64"),
          totalBytes: item.bytes,
          nextByteOffset:
            byteOffset + bytesRead < item.bytes ? byteOffset + bytesRead : null,
        };
      } finally {
        await handle.close();
      }
    }
    const streams = [createReadStream(item.file)];
    if (item.gzip) streams.push(createGunzip());
    let stream;
    // Read the first token to distinguish root arrays from JSON/JSONL records.
    if (item.format !== "csv" && !item.itemPath) {
      const probe = chain(streams);
      let first;
      try {
        for await (const chunk of probe) {
          first = chunk.toString().trimStart()[0];
          if (first) break;
        }
      } finally {
        probe.destroy();
        for (const stage of streams) stage.destroy();
      }
      streams.length = 0;
      streams.push(createReadStream(item.file));
      if (item.gzip) streams.push(createGunzip());
      streams.push(
        parser({ jsonStreaming: item.format === "jsonl" || first !== "[" }),
      );
      streams.push(first === "[" ? streamArray() : streamValues());
    } else if (item.format === "csv")
      streams.push(parse({ columns: true, bom: true, skip_empty_lines: true }));
    else {
      streams.push(parser());
      const parts = item.itemPath
        .slice(1)
        .split("/")
        .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"));
      streams.push(
        pick({
          filter: (stack) =>
            stack.length === parts.length &&
            stack.every((x, i) => String(x) === parts[i]),
        }),
      );
      streams.push(streamArray());
    }
    stream = chain(streams);
    const abort = () => stream.destroy(new Error("Database read interrupted"));
    signal?.addEventListener("abort", abort, { once: true });
    const records = [];
    let index = 0,
      more = false,
      displayBytes = 0;
    try {
      for await (const row of stream) {
        signal?.throwIfAborted();
        if (index++ < offset) continue;
        if (records.length >= Math.min(limit, 100)) {
          more = true;
          break;
        }
        const value = pointer(item.format === "csv" ? row : row.value, path);
        displayBytes += Buffer.byteLength(JSON.stringify(value));
        if (displayBytes > 60000)
          throw new Error(
            "Database selection exceeds display size. Use fewer records, a narrower record JSON Pointer, or raw bytes.",
          );
        records.push(value);
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      stream.destroy();
      for (const stage of streams)
        if (typeof stage.destroy === "function") stage.destroy();
    }
    return {
      id,
      dataset: item.dataset,
      offset,
      records,
      nextOffset: more ? offset + records.length : null,
    };
  }
}
