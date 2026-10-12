import { readFileSync, statSync } from "node:fs";

let cached, stamp;
export function catalogue() {
  const file = new URL("../data/catalogue.json", import.meta.url);
  const current = statSync(file).mtimeMs;
  if (current !== stamp) {
    cached = JSON.parse(readFileSync(file, "utf8"));
    stamp = current;
  }
  return cached;
}
export function endpoint(id) {
  const found = catalogue().operations.find((item) => item.id === id);
  if (!found)
    throw new Error(
      "Unknown endpoint. Use dataforseo_catalogue to find its exact ID.",
    );
  return found;
}
export function discover({
  query = "",
  family,
  kind = "api",
  offset = 0,
  limit = 25,
} = {}) {
  const entries =
    kind === "dataset"
      ? catalogue().datasets
      : kind === "guide"
        ? catalogue().guides
        : catalogue().operations;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = entries.filter(
    (item) =>
      (!family || item.family === family) &&
      words.every((word) => JSON.stringify(item).toLowerCase().includes(word)),
  );
  return {
    version: catalogue().version,
    total: found.length,
    offset,
    items: found
      .slice(offset, offset + Math.min(limit, 100))
      .map(
        ({ fields, requestSchema, responseSchema, parameters, ...item }) => ({
          ...item,
          fieldCount: fields.length,
        }),
      ),
    nextOffset: offset + limit < found.length ? offset + limit : null,
  };
}
export function inspect({ id, schema, offset = 0, limit = 50 }) {
  if (schema) {
    const definitions = JSON.parse(
      readFileSync(new URL("../data/schemas.json", import.meta.url), "utf8"),
    );
    const name = schema.replace("#/components/schemas/", "");
    if (!Object.hasOwn(definitions, name))
      throw new Error("Unknown schema name");
    const { properties = {}, ...shape } = definitions[name];
    const entries = Object.entries(properties);
    return {
      name,
      shape,
      properties: Object.fromEntries(entries.slice(offset, offset + limit)),
      totalProperties: entries.length,
      nextOffset: offset + limit < entries.length ? offset + limit : null,
    };
  }
  const item =
    catalogue().operations.find((x) => x.id === id) ||
    catalogue().datasets.find((x) => x.id === id) ||
    catalogue().guides.find((x) => x.id === id);
  if (!item) throw new Error("Unknown endpoint or dataset");
  return {
    ...item,
    fields: item.fields.slice(offset, offset + limit),
    totalFields: item.fields.length,
    nextOffset: offset + limit < item.fields.length ? offset + limit : null,
  };
}
