import { describe, it, expect } from "vitest";
import { ApiCompressor } from "../compressors/api.js";

function meta(result: { metadata?: Record<string, unknown> }): Record<string, unknown> {
  return result.metadata as Record<string, unknown>;
}

describe("ApiCompressor", () => {
  const compressor = new ApiCompressor();

  describe("basic output structure", () => {
    it("returns CompressResult with all required fields", () => {
      const result = compressor.compress('{"a":1}');
      expect(result.output).toBeDefined();
      expect(result.originalSize).toBeTypeOf("number");
      expect(result.compressedSize).toBeTypeOf("number");
      expect(result.ratio).toBeTypeOf("number");
      expect(result.format).toBe("air-api");
      expect(result.metadata).toBeDefined();
    });

    it("includes metadata counters", () => {
      const result = compressor.compress('{"a":1}');
      const m = meta(result);
      expect(m.fieldsRemoved).toBe(0);
      expect(m.arraysTruncated).toBe(0);
      expect(m.depthLimited).toBe(0);
      expect(m.nullsRemoved).toBe(0);
    });

    it("includes stats footer by default", () => {
      const result = compressor.compress('{"a":1}');
      expect(result.output).toContain("--- air:");
      expect(result.output).toContain("saved) ---");
    });

    it("outputs compact JSON (no indentation)", () => {
      const input = JSON.stringify({ a: 1, b: { c: 2 } }, null, 2);
      const result = compressor.compress(input);
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe('{"a":1,"b":{"c":2}}');
    });
  });

  describe("null/empty removal (removeNulls)", () => {
    it("removes null fields by default", () => {
      const result = compressor.compress('{"a":1,"b":null}');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: 1 });
      expect(meta(result).nullsRemoved).toBe(1);
    });

    it("removes undefined-equivalent fields", () => {
      const result = compressor.compress('{"a":1,"b":"","c":[]}');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: 1 });
      expect(meta(result).nullsRemoved).toBe(2);
    });

    it("removes empty object fields", () => {
      const result = compressor.compress('{"a":1,"b":{}}');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: 1 });
    });

    it("preserves null fields when removeNulls is false", () => {
      const result = compressor.compress('{"a":1,"b":null}', { removeNulls: false });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: 1, b: null });
    });

    it("removes null items from arrays", () => {
      const result = compressor.compress('[1,null,2,null,3]');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual([1, 2, 3]);
    });

    it("removes empty strings from arrays", () => {
      const result = compressor.compress('["a","","b"]');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual(["a", "b"]);
    });

    it("keeps non-empty values intact", () => {
      const input = '{"a":"hello","b":42,"c":true,"d":[1],"e":{"f":1}}';
      const result = compressor.compress(input);
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: "hello", b: 42, c: true, d: [1], e: { f: 1 } });
    });
  });

  describe("depth limiting (maxDepth)", () => {
    it("uses default depth of 5", () => {
      const deep = { l1: { l2: { l3: { l4: { l5: { l6: "too deep" } } } } } };
      const result = compressor.compress(JSON.stringify(deep));
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toContain("{...}");
      expect(meta(result).depthLimited).toBeGreaterThan(0);
    });

    it("respects custom maxDepth", () => {
      const nested = { a: { b: { c: "value" } } };
      const result = compressor.compress(JSON.stringify(nested), { maxDepth: 2 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.a.b).toBe("{...}");
    });

    it("replaces deep arrays with [...]", () => {
      const deep = { a: { b: { c: [1, 2, 3] } } };
      const result = compressor.compress(JSON.stringify(deep), { maxDepth: 3 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.a.b.c).toBe("[...]");
    });

    it("allows maxDepth=1 to flatten to top level only", () => {
      const input = { a: 1, b: { nested: true } };
      const result = compressor.compress(JSON.stringify(input), { maxDepth: 1 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toBe("{...}");
    });

    it("handles very deeply nested JSON (100+ levels) without stack overflow", () => {
      let obj: Record<string, unknown> = { value: "leaf" };
      for (let i = 0; i < 150; i++) {
        obj = { nested: obj };
      }
      const result = compressor.compress(JSON.stringify(obj), { maxDepth: 3 });
      expect(result.format).toBe("air-api");
      expect(meta(result).depthLimited).toBeGreaterThan(0);
    });
  });

  describe("array truncation (maxArrayLength)", () => {
    it("uses default maxArrayLength of 5", () => {
      const arr = Array.from({ length: 10 }, (_, i) => i);
      const result = compressor.compress(JSON.stringify(arr));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed).toHaveLength(6);
      expect(parsed[5]).toBe("... (5 more items)");
      expect(meta(result).arraysTruncated).toBe(1);
    });

    it("respects custom maxArrayLength", () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = compressor.compress(JSON.stringify(arr), { maxArrayLength: 3 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed).toHaveLength(4);
      expect(parsed[3]).toBe("... (5 more items)");
    });

    it("does not truncate arrays within limit", () => {
      const arr = [1, 2, 3];
      const result = compressor.compress(JSON.stringify(arr), { maxArrayLength: 5 });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual([1, 2, 3]);
      expect(meta(result).arraysTruncated).toBe(0);
    });

    it("truncates nested arrays", () => {
      const input = { items: Array.from({ length: 20 }, (_, i) => i) };
      const result = compressor.compress(JSON.stringify(input), { maxArrayLength: 2 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.items).toHaveLength(3);
      expect(parsed.items[2]).toBe("... (18 more items)");
    });

    it("handles large arrays (1000+ items) efficiently", () => {
      const arr = Array.from({ length: 2000 }, (_, i) => ({ id: i }));
      const start = performance.now();
      const result = compressor.compress(JSON.stringify(arr), { maxArrayLength: 3 });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(5000);
      expect(meta(result).arraysTruncated).toBe(1);
    });

    it("maxArrayLength=1 keeps only first item", () => {
      const result = compressor.compress("[10,20,30,40]", { maxArrayLength: 1 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed[0]).toBe(10);
      expect(parsed[1]).toBe("... (3 more items)");
    });
  });

  describe("schema-aware filtering (schemaFields)", () => {
    it("keeps only specified top-level fields", () => {
      const input = { id: 1, name: "test", email: "a@b.c", age: 30, role: "admin" };
      const result = compressor.compress(JSON.stringify(input), {
        schemaFields: ["id", "name"],
      });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ id: 1, name: "test" });
      expect(meta(result).fieldsRemoved).toBe(3);
    });

    it("does not filter nested fields", () => {
      const input = { id: 1, data: { name: "test", extra: "value" } };
      const result = compressor.compress(JSON.stringify(input), {
        schemaFields: ["id", "data"],
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.data.name).toBe("test");
      expect(parsed.data.extra).toBe("value");
    });

    it("returns empty object when no fields match", () => {
      const result = compressor.compress('{"a":1,"b":2}', {
        schemaFields: ["x", "y"],
      });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({});
    });

    it("works with arrays at top level (no filtering applied)", () => {
      const result = compressor.compress("[1,2,3]", { schemaFields: ["id"] });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual([1, 2, 3]);
    });
  });

  describe("metadata stripping", () => {
    it("removes _links field", () => {
      const input = { id: 1, _links: { self: "/api/1" } };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ id: 1 });
      expect(meta(result).fieldsRemoved).toBeGreaterThan(0);
    });

    it("removes __typename field", () => {
      const input = { __typename: "User", id: 1, name: "test" };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.__typename).toBeUndefined();
      expect(parsed.id).toBe(1);
    });

    it("removes $schema field", () => {
      const input = { $schema: "http://json-schema.org/draft-07", type: "object" };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.$schema).toBeUndefined();
      expect(parsed.type).toBe("object");
    });

    it("removes @odata.context field", () => {
      const input = { "@odata.context": "https://graph.microsoft.com", value: [1, 2] };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed["@odata.context"]).toBeUndefined();
    });

    it("removes _embedded field", () => {
      const input = { id: 1, _embedded: { items: [1, 2, 3] } };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ id: 1 });
    });

    it("removes _meta field", () => {
      const input = { data: "value", _meta: { page: 1 } };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ data: "value" });
    });

    it("removes metadata fields at nested levels too", () => {
      const input = { user: { id: 1, __typename: "User", name: "test" } };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.user.__typename).toBeUndefined();
      expect(parsed.user.name).toBe("test");
    });

    it("removes multiple metadata fields simultaneously", () => {
      const input = {
        id: 1,
        _links: {},
        _embedded: {},
        __typename: "Item",
        _meta: {},
        name: "real data",
      };
      const result = compressor.compress(JSON.stringify(input));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(Object.keys(parsed)).toEqual(["id", "name"]);
    });
  });

  describe("default value removal (removeDefaults)", () => {
    it("does not remove defaults by default", () => {
      const input = { a: false, b: 0, c: "" };
      const result = compressor.compress(JSON.stringify(input), { removeNulls: false });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ a: false, b: 0, c: "" });
    });

    it("removes false values when enabled", () => {
      const result = compressor.compress('{"active":false,"name":"test"}', {
        removeDefaults: true,
        removeNulls: false,
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.active).toBeUndefined();
      expect(parsed.name).toBe("test");
    });

    it("removes 0 values when enabled", () => {
      const result = compressor.compress('{"count":0,"name":"test"}', {
        removeDefaults: true,
        removeNulls: false,
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.count).toBeUndefined();
    });

    it("removes empty string values when enabled", () => {
      const result = compressor.compress('{"bio":"","name":"test"}', {
        removeDefaults: true,
        removeNulls: false,
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.bio).toBeUndefined();
    });

    it("keeps non-default values when removeDefaults is true", () => {
      const result = compressor.compress('{"active":true,"count":5,"name":"test"}', {
        removeDefaults: true,
      });
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({ active: true, count: 5, name: "test" });
    });
  });

  describe("pretty-print to compact", () => {
    it("compacts pretty-printed JSON", () => {
      const pretty = JSON.stringify({ a: 1, b: [1, 2], c: { d: 3 } }, null, 4);
      const result = compressor.compress(pretty);
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe('{"a":1,"b":[1,2],"c":{"d":3}}');
    });

    it("compacts JSON with 2-space indent", () => {
      const pretty = JSON.stringify({ x: "hello" }, null, 2);
      const result = compressor.compress(pretty);
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe('{"x":"hello"}');
    });

    it("compacts JSON with tab indentation", () => {
      const pretty = JSON.stringify({ key: "value" }, null, "\t");
      const result = compressor.compress(pretty);
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe('{"key":"value"}');
    });
  });

  describe("edge cases", () => {
    it("handles invalid JSON gracefully", () => {
      const result = compressor.compress("not json at all");
      expect(result.output).toBe("not json at all");
      expect(result.ratio).toBe(1);
      expect(meta(result).error).toBe("Invalid JSON input");
    });

    it("handles truncated JSON", () => {
      const result = compressor.compress('{"a": 1, "b":');
      expect(result.output).toBe('{"a": 1, "b":');
      expect(meta(result).error).toBe("Invalid JSON input");
    });

    it("handles primitive JSON string", () => {
      const result = compressor.compress('"hello world"');
      expect(result.output).toBe('"hello world"');
    });

    it("handles primitive JSON number", () => {
      const result = compressor.compress("42");
      expect(result.output).toBe("42");
    });

    it("handles primitive JSON boolean", () => {
      const result = compressor.compress("true");
      expect(result.output).toBe("true");
    });

    it("handles JSON null", () => {
      const result = compressor.compress("null");
      expect(result.output).toBe("null");
    });

    it("handles empty object", () => {
      const result = compressor.compress("{}");
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe("{}");
    });

    it("handles empty array", () => {
      const result = compressor.compress("[]");
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe("[]");
    });

    it("handles empty string input", () => {
      const result = compressor.compress("");
      expect(result.output).toBe("");
      expect(meta(result).error).toBe("Invalid JSON input");
    });

    it("handles already-compact JSON with minimal overhead", () => {
      const compact = '{"id":1,"name":"test"}';
      const result = compressor.compress(compact);
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).toBe(compact);
    });

    it("handles object with only null fields", () => {
      const result = compressor.compress('{"a":null,"b":null,"c":null}');
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual({});
      expect(meta(result).nullsRemoved).toBe(3);
    });

    it("handles array with only null items", () => {
      const result = compressor.compress("[null,null,null]");
      const jsonPart = result.output.split("\n")[0];
      expect(JSON.parse(jsonPart)).toEqual([]);
    });
  });

  describe("maxLines and maxTokens limits", () => {
    it("respects maxLines limit", () => {
      const result = compressor.compress('{"a":1}', { maxLines: 1 });
      const lines = result.output.split("\n");
      expect(lines.length).toBeLessThanOrEqual(1);
    });

    it("omits stats footer when maxLines is 1", () => {
      const result = compressor.compress('{"a":1}', { maxLines: 1 });
      expect(result.output).not.toContain("--- air:");
      expect(meta(result).statsIncluded).toBe(false);
    });

    it("respects maxTokens limit", () => {
      const largeObj: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeObj[`field${i}`] = `value${i}`.repeat(10);
      }
      const prettyJson = JSON.stringify(largeObj, null, 2);
      const result = compressor.compress(prettyJson, { maxTokens: 50 });
      expect(result.output.length).toBeLessThan(prettyJson.length);
    });

    it("omits stats footer when maxTokens is very small", () => {
      const result = compressor.compress('{"a":1}', { maxTokens: 5 });
      expect(meta(result).statsIncluded).toBe(false);
    });

    it("ignores invalid maxLines (negative)", () => {
      const result = compressor.compress('{"a":1}', { maxLines: -5 });
      expect(result.output).toContain("--- air:");
    });

    it("ignores invalid maxLines (NaN)", () => {
      const result = compressor.compress('{"a":1}', { maxLines: NaN });
      expect(result.output).toContain("--- air:");
    });

    it("ignores invalid maxTokens (zero)", () => {
      const result = compressor.compress('{"a":1}', { maxTokens: 0 });
      expect(result.output).toContain("--- air:");
    });
  });

  describe("combined options", () => {
    it("applies removeNulls + maxDepth together", () => {
      const input = {
        a: null,
        b: { c: { d: { e: { f: { g: "deep" } } } } },
        x: "keep",
      };
      const result = compressor.compress(JSON.stringify(input), { maxDepth: 3 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.a).toBeUndefined();
      expect(parsed.x).toBe("keep");
      expect(meta(result).nullsRemoved).toBeGreaterThan(0);
      expect(meta(result).depthLimited).toBeGreaterThan(0);
    });

    it("applies schemaFields + removeNulls together", () => {
      const input = { id: 1, name: null, email: "a@b.c", extra: "removed" };
      const result = compressor.compress(JSON.stringify(input), {
        schemaFields: ["id", "name", "email"],
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.id).toBe(1);
      expect(parsed.name).toBeUndefined();
      expect(parsed.email).toBe("a@b.c");
      expect(parsed.extra).toBeUndefined();
    });

    it("applies array truncation + null removal together", () => {
      const arr = [1, null, 2, null, 3, null, 4, null, 5, null, 6, 7, 8];
      const result = compressor.compress(JSON.stringify(arr), { maxArrayLength: 3 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed[0]).toBe(1);
      expect(meta(result).arraysTruncated).toBe(1);
      expect(meta(result).nullsRemoved).toBeGreaterThan(0);
    });

    it("applies removeDefaults + metadata stripping together", () => {
      const input = { id: 1, active: false, _links: {}, __typename: "Item" };
      const result = compressor.compress(JSON.stringify(input), { removeDefaults: true });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed).toEqual({ id: 1 });
    });

    it("applies all options simultaneously", () => {
      const input = {
        id: 1,
        name: "test",
        bio: null,
        active: false,
        _links: { self: "/api" },
        __typename: "User",
        nested: { deep: { deeper: { deepest: { value: 42 } } } },
        tags: ["a", "b", "c", "d", "e", "f", "g"],
      };
      const result = compressor.compress(JSON.stringify(input), {
        maxDepth: 3,
        maxArrayLength: 3,
        removeNulls: true,
        removeDefaults: true,
        schemaFields: ["id", "name", "nested", "tags"],
      });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.id).toBe(1);
      expect(parsed.name).toBe("test");
      expect(parsed._links).toBeUndefined();
      expect(parsed.__typename).toBeUndefined();
      expect(parsed.bio).toBeUndefined();
      expect(parsed.active).toBeUndefined();
    });
  });

  describe("metadata accuracy", () => {
    it("counts fieldsRemoved correctly for metadata stripping", () => {
      const input = { id: 1, _links: {}, __typename: "X", name: "test" };
      const result = compressor.compress(JSON.stringify(input), { removeNulls: false });
      expect(meta(result).fieldsRemoved).toBe(2);
    });

    it("counts nullsRemoved correctly for multiple nulls", () => {
      const input = { a: null, b: null, c: null, d: 1 };
      const result = compressor.compress(JSON.stringify(input));
      expect(meta(result).nullsRemoved).toBe(3);
    });

    it("counts arraysTruncated for multiple arrays", () => {
      const input = {
        arr1: [1, 2, 3, 4, 5, 6, 7, 8],
        arr2: [1, 2, 3, 4, 5, 6],
      };
      const result = compressor.compress(JSON.stringify(input));
      expect(meta(result).arraysTruncated).toBe(2);
    });

    it("counts depthLimited correctly", () => {
      const input = {
        a: { b: { c: { d: { e: { f: 1 } } } } },
        x: { y: { z: { w: { v: { u: 2 } } } } },
      };
      const result = compressor.compress(JSON.stringify(input));
      expect(meta(result).depthLimited).toBe(2);
    });

    it("reports savedPercent as non-negative", () => {
      const result = compressor.compress('{"a":1}');
      expect(meta(result).savedPercent).toBeGreaterThanOrEqual(0);
    });

    it("format is always air-api", () => {
      expect(compressor.compress("{}").format).toBe("air-api");
      expect(compressor.compress("invalid").format).toBe("air-api");
      expect(compressor.compress("42").format).toBe("air-api");
    });
  });

  describe("sanitizePositiveInt behavior", () => {
    it("uses default maxDepth for 0", () => {
      const deep = { a: { b: { c: { d: { e: { f: "deep" } } } } } };
      const result = compressor.compress(JSON.stringify(deep), { maxDepth: 0 });
      expect(meta(result).depthLimited).toBeGreaterThan(0);
    });

    it("uses default maxArrayLength for negative value", () => {
      const arr = Array.from({ length: 10 }, (_, i) => i);
      const result = compressor.compress(JSON.stringify(arr), { maxArrayLength: -1 });
      expect(meta(result).arraysTruncated).toBe(1);
    });

    it("floors fractional maxDepth", () => {
      const nested = { a: { b: { c: "value" } } };
      const result = compressor.compress(JSON.stringify(nested), { maxDepth: 2.9 });
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed.a.b).toBe("{...}");
    });
  });

  describe("realistic API responses", () => {
    it("compresses a GitHub-style API response", () => {
      const githubResponse = {
        id: 1,
        name: "repo",
        full_name: "user/repo",
        owner: {
          login: "user",
          id: 42,
          avatar_url: "https://avatars.githubusercontent.com/u/42",
          _links: { self: "/users/42" },
        },
        description: null,
        fork: false,
        _links: {
          html: "https://github.com/user/repo",
          git: "git://github.com/user/repo.git",
        },
      };
      const result = compressor.compress(JSON.stringify(githubResponse, null, 2));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed._links).toBeUndefined();
      expect(parsed.description).toBeUndefined();
      expect(parsed.owner._links).toBeUndefined();
      expect(parsed.name).toBe("repo");
    });

    it("compresses a paginated API response with large array", () => {
      const items = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        description: null,
        metadata: {},
      }));
      const response = {
        _meta: { page: 1, total: 50, per_page: 50 },
        _links: { next: "/api/items?page=2" },
        items,
      };
      const result = compressor.compress(JSON.stringify(response, null, 2));
      const jsonPart = result.output.split("\n")[0];
      const parsed = JSON.parse(jsonPart);
      expect(parsed._meta).toBeUndefined();
      expect(parsed._links).toBeUndefined();
      expect(parsed.items.length).toBeLessThan(50);
    });

    it("compresses a GraphQL response with __typename", () => {
      const graphqlResponse = {
        data: {
          user: {
            __typename: "User",
            id: "1",
            name: "Test User",
            posts: {
              __typename: "PostConnection",
              edges: [
                { __typename: "PostEdge", node: { __typename: "Post", id: "1", title: "Hello" } },
                { __typename: "PostEdge", node: { __typename: "Post", id: "2", title: "World" } },
              ],
            },
          },
        },
      };
      const result = compressor.compress(JSON.stringify(graphqlResponse, null, 2));
      const jsonPart = result.output.split("\n")[0];
      expect(jsonPart).not.toContain("__typename");
      expect(jsonPart).toContain("Test User");
    });
  });
});
