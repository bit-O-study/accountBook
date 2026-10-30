// Tag every node so user-controlled objects/strings cannot turn into Date objects.
type Wire = ["null"] | ["date", string] | ["value", string | number | boolean] | ["array", Wire[]] | ["object", [string, Wire][]];
export function encode(value: unknown): Wire {
  if (value == null) return ["null"];
  if (value instanceof Date) return ["date", value.toISOString()];
  if (Array.isArray(value)) return ["array", value.map(encode)];
  if (typeof value === "object") return ["object", Object.entries(value).map(([key, v]) => [key, encode(v)])];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return ["value", value];
  throw new Error("Unsupported response type");
}
export function decode(node: Wire): unknown {
  switch (node[0]) {
    case "null": return null;
    case "date": return new Date(node[1]);
    case "value": return node[1];
    case "array": return node[1].map(decode);
    case "object": return Object.fromEntries(node[1].map(([key, value]) => [key, decode(value)]));
    default: throw new Error("Invalid API response");
  }
}
