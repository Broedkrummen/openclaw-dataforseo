import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { setTimeout as pause } from "node:timers/promises";

export class Store {
  constructor(root = join(homedir(), ".openclaw", "dataforseo")) {
    this.root = root;
  }
  async init() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  path(id, extension = "json") {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
      throw new Error("Invalid saved-result ID");
    return join(this.root, id + "." + extension);
  }
  async put(id, value) {
    await this.init();
    const file = this.path(id);
    const temporary = file + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  }
  async get(id) {
    return JSON.parse(await readFile(this.path(id), "utf8"));
  }
  async save(raw, metadata) {
    const id = randomUUID();
    await this.init();
    await writeFile(this.path(id, "raw"), raw, { mode: 0o600 });
    await this.put(id, {
      id,
      kind: "response",
      createdAt: new Date().toISOString(),
      bytes: Buffer.byteLength(raw),
      ...metadata,
    });
    return id;
  }
  async list(kind) {
    await this.init();
    const result = [];
    for (const file of await readdir(this.root))
      if (/^[\w-]+\.json$/.test(file)) {
        const item = await this.get(file.slice(0, -5));
        if (!kind || item.kind === kind) result.push(item);
      }
    return result.sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
  }
  async result({
    id,
    path = "",
    offset = 0,
    limit = 25,
    raw = false,
    byteOffset = 0,
    byteLength = 12000,
  }) {
    const metadata = await this.get(id);
    if (metadata.kind !== "response")
      throw new Error("ID is not an API response");
    if (raw) {
      const handle = await open(this.path(id, "raw"), "r");
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
          byteOffset,
          data: buffer.subarray(0, bytesRead).toString("base64"),
          nextByteOffset:
            byteOffset + bytesRead < metadata.bytes
              ? byteOffset + bytesRead
              : null,
          totalBytes: metadata.bytes,
        };
      } finally {
        await handle.close();
      }
    }
    let value = JSON.parse(await readFile(this.path(id, "raw"), "utf8"));
    if (path && !path.startsWith("/"))
      throw new Error("Use a JSON Pointer starting with /");
    for (const part of path ? path.slice(1).split("/") : []) {
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (
        value === null ||
        typeof value !== "object" ||
        !Object.hasOwn(value, key)
      )
        throw new Error("JSON Pointer does not exist");
      value = value[key];
    }
    const total = Array.isArray(value) ? value.length : null;
    const selected = Array.isArray(value)
      ? value.slice(offset, offset + Math.min(limit, 100))
      : value;
    if (Buffer.byteLength(JSON.stringify(selected)) > 60000)
      throw new Error(
        "Selection exceeds display size. Narrow the JSON Pointer or retrieve raw bytes; the complete response is saved.",
      );
    return {
      id,
      path,
      value: selected,
      total,
      nextOffset:
        total !== null && offset + limit < total ? offset + limit : null,
    };
  }
  async delete(id) {
    const item = await this.get(id);
    await rm(this.path(id));
    if (item.kind === "response")
      await rm(this.path(id, "raw"), { force: true });
    return { deleted: id };
  }
  async lock(key, action, signal, waitTimeoutMs = 120000) {
    await this.init();
    const file = this.path("lock-" + key, "lock");
    const deadline = Date.now() + waitTimeoutMs;
    let handle;
    while (!handle) {
      signal?.throwIfAborted();
      try {
        handle = await open(file, "wx", 0o600);
        await handle.writeFile(String(process.pid));
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const owner = Number(await readFile(file, "utf8"));
          if (owner) process.kill(owner, 0);
        } catch (error) {
          if (error.code === "ESRCH") {
            await rm(file, { force: true });
            continue;
          }
        }
        if (Date.now() > deadline)
          throw new Error("Another paid request holds the account lock");
        await pause(100, undefined, { signal });
      }
    }
    try {
      return await action();
    } finally {
      await handle.close();
      await rm(file, { force: true });
    }
  }
}
