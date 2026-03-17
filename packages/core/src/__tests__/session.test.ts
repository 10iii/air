import { describe, it, expect } from "vitest";
import { SessionCompressor } from "../compressors/session.js";
import type { CompressResult } from "../types.js";

function msg(role: string, content: string, extra?: Record<string, unknown>) {
  return { role, content, ...extra };
}

function buildSession(messages: unknown[]): string {
  return JSON.stringify(messages);
}

function parseOutput(result: CompressResult): unknown[] {
  return JSON.parse(result.output);
}

function longString(len: number, char = "x"): string {
  return char.repeat(len);
}

describe("SessionCompressor", () => {
  const compressor = new SessionCompressor();

  describe("CompressResult structure", () => {
    it("returns all required fields", () => {
      const input = buildSession([msg("user", "hello"), msg("assistant", "hi")]);
      const result = compressor.compress(input);

      expect(result).toHaveProperty("output");
      expect(result).toHaveProperty("originalSize");
      expect(result).toHaveProperty("compressedSize");
      expect(result).toHaveProperty("ratio");
      expect(result).toHaveProperty("format");
      expect(result).toHaveProperty("metadata");
    });

    it("sets format to air-session", () => {
      const input = buildSession([msg("user", "hello")]);
      const result = compressor.compress(input);
      expect(result.format).toBe("air-session");
    });

    it("includes correct metadata keys", () => {
      const input = buildSession([msg("user", "hello"), msg("assistant", "hi")]);
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;

      expect(meta).toHaveProperty("messagesOriginal");
      expect(meta).toHaveProperty("messagesCompressed");
      expect(meta).toHaveProperty("strategy");
      expect(meta).toHaveProperty("anchorsPreserved");
    });

    it("calculates ratio as compressedSize / originalSize", () => {
      const input = buildSession([msg("user", "hello")]);
      const result = compressor.compress(input);
      expect(result.ratio).toBeCloseTo(result.compressedSize / result.originalSize, 5);
    });

    it("sets originalSize to input line count", () => {
      const input = buildSession([msg("user", "hello")]);
      const result = compressor.compress(input);
      expect(result.originalSize).toBe(input.split("\n").length);
    });

    it("sets compressedSize to output line count", () => {
      const input = buildSession([msg("user", "hello")]);
      const result = compressor.compress(input);
      expect(result.compressedSize).toBe(result.output.split("\n").length);
    });
  });

  describe("edge cases", () => {
    it("handles empty array input", () => {
      const result = compressor.compress("[]");
      expect(result.output).toBe("[]");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.messagesOriginal).toBe(0);
      expect(meta.messagesCompressed).toBe(0);
    });

    it("handles invalid JSON input", () => {
      const result = compressor.compress("not json at all {{{");
      expect(result.output).toContain("error");
      expect(result.output).toContain("Invalid JSON");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.error).toBe("Invalid JSON input");
    });

    it("handles non-array JSON input", () => {
      const result = compressor.compress('{"role":"user"}');
      expect(result.output).toContain("error");
      expect(result.output).toContain("not a JSON array");
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.error).toBe("Input is not a JSON array");
    });

    it("returns single message unchanged", () => {
      const messages = [msg("user", "hello world")];
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const parsed = parseOutput(result);

      expect(parsed).toHaveLength(1);
      expect((parsed[0] as Record<string, unknown>).content).toBe("hello world");
    });

    it("handles messages with null content", () => {
      const input = buildSession([
        msg("user", "hello"),
        { role: "assistant", content: null, tool_calls: [] },
      ]);
      const result = compressor.compress(input);
      expect(() => parseOutput(result)).not.toThrow();
    });

    it("handles empty string content", () => {
      const input = buildSession([
        msg("user", ""),
        msg("assistant", ""),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result);
      expect(parsed).toHaveLength(2);
    });

    it("preserves output as valid JSON", () => {
      const input = buildSession([
        msg("user", "hello"),
        msg("assistant", "world"),
        msg("user", "how are you"),
      ]);
      const result = compressor.compress(input);
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it("does not include stats footer in output", () => {
      const input = buildSession([
        msg("user", "hello"),
        msg("assistant", "world"),
      ]);
      const result = compressor.compress(input);
      expect(result.output).not.toContain("--- air:");
    });
  });

  describe("long message truncation", () => {
    it("truncates messages over 10000 chars", () => {
      const longContent = longString(15000);
      const input = buildSession([
        msg("user", "hello"),
        msg("assistant", longContent),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant");

      expect(assistantMsg).toBeDefined();
      expect(assistantMsg!.content).toContain("[truncated:");
      expect(assistantMsg!.content).toContain("5000 chars");
      expect(assistantMsg!.content.length).toBeLessThan(longContent.length);
    });

    it("does not truncate messages under 10000 chars", () => {
      const content = longString(9999);
      const input = buildSession([
        msg("user", "hi"),
        msg("assistant", content),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant");

      expect(assistantMsg!.content).not.toContain("[truncated:");
    });

    it("truncates exactly at 10000 char boundary", () => {
      const content = longString(10001);
      const input = buildSession([
        msg("user", "hi"),
        msg("assistant", content),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant");

      expect(assistantMsg!.content).toContain("[truncated: 1 chars]");
    });
  });

  describe("tool result compression", () => {
    it("compresses long tool results in balanced mode", () => {
      const longToolContent = longString(500, "a");
      const input = buildSession([
        msg("user", "read file"),
        msg("assistant", "reading"),
        { role: "tool", content: longToolContent, tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg).toBeDefined();
      expect(toolMsg!.content).toContain("[air-compressed:");
      expect(toolMsg!.content.length).toBeLessThan(longToolContent.length);
    });

    it("does not compress short tool results", () => {
      const shortContent = "file content here";
      const input = buildSession([
        msg("user", "read"),
        msg("assistant", "ok"),
        { role: "tool", content: shortContent, tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg!.content).toBe(shortContent);
    });

    it("compresses tool results at exactly 201 chars", () => {
      const content = longString(201);
      const input = buildSession([
        msg("user", "read"),
        msg("assistant", "ok"),
        { role: "tool", content, tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg!.content).toContain("[air-compressed:");
    });

    it("keeps tool results at exactly 200 chars unchanged", () => {
      const content = longString(200);
      const input = buildSession([
        msg("user", "read"),
        msg("assistant", "ok"),
        { role: "tool", content, tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg!.content).not.toContain("[air-compressed:");
    });
  });

  describe("system message preservation", () => {
    it("never compresses system messages", () => {
      const systemContent = longString(1000, "s");
      const input = buildSession([
        msg("system", systemContent),
        msg("user", "hello"),
        msg("assistant", "hi"),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const sysMsg = parsed.find((m) => m.role === "system");

      expect(sysMsg).toBeDefined();
      expect(sysMsg!.content).toBe(systemContent);
    });

    it("preserves system messages with time-decay strategy", () => {
      const systemContent = longString(600, "s");
      const messages = [
        msg("system", systemContent),
        ...Array.from({ length: 12 }, (_, i) =>
          msg(i % 2 === 0 ? "user" : "assistant", `message ${i} ${longString(300)}`)
        ),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const sysMsg = parsed.find((m) => m.role === "system");

      expect(sysMsg!.content).toBe(systemContent);
    });

    it("preserves system messages with maxMessages limit", () => {
      const messages = [
        msg("system", "you are a helpful assistant"),
        msg("user", "msg1"),
        msg("assistant", "reply1"),
        msg("user", "msg2"),
        msg("assistant", "reply2"),
        msg("user", "msg3"),
        msg("assistant", "reply3"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 3 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const systemMessages = parsed.filter((m) => m.role === "system");

      expect(systemMessages.some((m) => m.content === "you are a helpful assistant")).toBe(true);
    });
  });

  describe("anchor preservation", () => {
    it("preserves messages with [IMPORTANT] marker", () => {
      const messages = Array.from({ length: 12 }, (_, i) => {
        if (i === 3) return msg("user", "[IMPORTANT] remember this key fact");
        return msg(i % 2 === 0 ? "user" : "assistant", `message ${i} ${longString(300)}`);
      });
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const importantMsg = parsed.find((m) =>
        m.content && m.content.includes("[IMPORTANT] remember this key fact")
      );
      expect(importantMsg).toBeDefined();
    });

    it("preserves messages with [PIN] marker", () => {
      const messages = [
        msg("user", "hello"),
        msg("assistant", "[PIN] critical configuration: port=8080"),
        msg("user", longString(500)),
        msg("assistant", longString(500)),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const pinnedMsg = parsed.find((m) =>
        m.content && m.content.includes("[PIN] critical configuration")
      );
      expect(pinnedMsg).toBeDefined();
    });

    it("reports correct anchorsPreserved count in metadata", () => {
      const messages = [
        msg("user", "[IMPORTANT] fact one"),
        msg("assistant", "ok"),
        msg("user", "[PIN] fact two"),
        msg("assistant", "[IMPORTANT] fact three"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;
      expect(meta.anchorsPreserved).toBe(3);
    });

    it("preserves anchored messages even with maxMessages limit", () => {
      const messages = [
        msg("user", "[IMPORTANT] must keep"),
        msg("assistant", "reply1"),
        msg("user", "msg2"),
        msg("assistant", "reply2"),
        msg("user", "msg3"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 2 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const important = parsed.find((m) => m.content && m.content.includes("[IMPORTANT] must keep"));
      expect(important).toBeDefined();
    });
  });

  describe("time-decay strategy", () => {
    it("compresses older messages more aggressively", () => {
      const messages = Array.from({ length: 12 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `message ${i}: ${longString(400)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const firstMsg = parsed[0];
      expect(firstMsg.content).toContain("[air-compressed: time-decay");

      const lastMsg = parsed[parsed.length - 1];
      expect(lastMsg.content).not.toContain("[air-compressed:");
    });

    it("does not apply time-decay to sessions with 3 or fewer messages", () => {
      const messages = [
        msg("user", longString(300)),
        msg("assistant", longString(300)),
        msg("user", longString(300)),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      for (const m of parsed) {
        expect(m.content).not.toContain("[air-compressed: time-decay");
      }
    });

    it("compresses first third most aggressively (>200 char threshold)", () => {
      const messages = Array.from({ length: 9 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}: ${longString(250)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      expect(parsed[0].content).toContain("[air-compressed: time-decay");
      expect(parsed[1].content).toContain("[air-compressed: time-decay");
    });

    it("does not compress short messages in first third", () => {
      const messages = Array.from({ length: 9 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `short msg ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { strategy: "time-decay" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      for (const m of parsed) {
        expect(m.content).not.toContain("[air-compressed:");
      }
    });

    it("sets strategy metadata to time-decay", () => {
      const input = buildSession([msg("user", "a"), msg("assistant", "b")]);
      const result = compressor.compress(input, { strategy: "time-decay" });
      expect((result.metadata as Record<string, unknown>).strategy).toBe("time-decay");
    });
  });

  describe("tool-focused strategy", () => {
    it("compresses long tool results", () => {
      const input = buildSession([
        msg("user", "read the file"),
        msg("assistant", "reading"),
        { role: "tool", content: longString(500), tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input, { strategy: "tool-focused" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg!.content).toContain("[air-compressed:");
    });

    it("compresses long tool_call arguments", () => {
      const input = buildSession([
        msg("user", "edit file"),
        {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "tc1",
            type: "function",
            function: { name: "edit_file", arguments: longString(300) },
          }],
        },
        { role: "tool", content: "done", tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input, { strategy: "tool-focused" });
      const parsed = parseOutput(result) as Array<Record<string, unknown>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant");
      const toolCalls = assistantMsg!.tool_calls as Array<{ function: { arguments: string } }>;

      expect(toolCalls[0].function.arguments).toContain("[air-compressed:");
    });

    it("keeps short tool_call arguments unchanged", () => {
      const shortArgs = '{"file": "test.ts"}';
      const input = buildSession([
        msg("user", "edit file"),
        {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "tc1",
            type: "function",
            function: { name: "edit_file", arguments: shortArgs },
          }],
        },
        { role: "tool", content: "done", tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input, { strategy: "tool-focused" });
      const parsed = parseOutput(result) as Array<Record<string, unknown>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant");
      const toolCalls = assistantMsg!.tool_calls as Array<{ function: { arguments: string } }>;

      expect(toolCalls[0].function.arguments).toBe(shortArgs);
    });

    it("keeps user messages intact", () => {
      const userContent = longString(1000);
      const input = buildSession([
        msg("user", userContent),
        msg("assistant", "ok"),
        { role: "tool", content: longString(500), tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input, { strategy: "tool-focused" });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const userMsg = parsed.find((m) => m.role === "user");

      expect(userMsg!.content).toBe(userContent);
    });

    it("sets strategy metadata to tool-focused", () => {
      const input = buildSession([msg("user", "a"), msg("assistant", "b")]);
      const result = compressor.compress(input, { strategy: "tool-focused" });
      expect((result.metadata as Record<string, unknown>).strategy).toBe("tool-focused");
    });
  });

  describe("balanced strategy (default)", () => {
    it("is used by default when no strategy is specified", () => {
      const input = buildSession([msg("user", "a"), msg("assistant", "b")]);
      const result = compressor.compress(input);
      expect((result.metadata as Record<string, unknown>).strategy).toBe("balanced");
    });

    it("compresses tool results", () => {
      const input = buildSession([
        msg("user", "check"),
        msg("assistant", "checking"),
        { role: "tool", content: longString(500), tool_call_id: "tc1" },
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const toolMsg = parsed.find((m) => m.role === "tool");

      expect(toolMsg!.content).toContain("[air-compressed:");
    });

    it("applies moderate time-decay for sessions with >6 messages", () => {
      const messages = Array.from({ length: 9 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}: ${longString(600)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const firstMsg = parsed[0];
      expect(firstMsg.content).toContain("[air-compressed: balanced");
    });

    it("does not apply time-decay for sessions with <=6 messages", () => {
      const messages = Array.from({ length: 6 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}: ${longString(600)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      for (const m of parsed) {
        if (m.content) {
          expect(m.content).not.toContain("[air-compressed: balanced");
        }
      }
    });
  });

  describe("repetition detection", () => {
    it("detects read/edit cycles and merges them", () => {
      const messages = [
        msg("user", "fix the file"),
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc1", type: "function", function: { name: "read_file", arguments: "{}" } }],
        },
        { role: "tool", content: "file content 1", tool_call_id: "tc1" },
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc2", type: "function", function: { name: "edit_file", arguments: "{}" } }],
        },
        { role: "tool", content: "ok", tool_call_id: "tc2" },
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc3", type: "function", function: { name: "read_file", arguments: "{}" } }],
        },
        { role: "tool", content: "file content 2", tool_call_id: "tc3" },
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc4", type: "function", function: { name: "edit_file", arguments: "{}" } }],
        },
        { role: "tool", content: "ok", tool_call_id: "tc4" },
        msg("user", "done?"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const meta = result.metadata as Record<string, unknown>;

      expect((meta.messagesCompressed as number)).toBeLessThan(meta.messagesOriginal as number);
      const merged = parsed.find((m) =>
        m.content && m.content.includes("repetitive read/edit cycle")
      );
      expect(merged).toBeDefined();
    });

    it("does not merge single read/edit pair", () => {
      const messages = [
        msg("user", "fix"),
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc1", type: "function", function: { name: "read_file", arguments: "{}" } }],
        },
        { role: "tool", content: "content", tool_call_id: "tc1" },
        {
          role: "assistant", content: null,
          tool_calls: [{ id: "tc2", type: "function", function: { name: "edit_file", arguments: "{}" } }],
        },
        { role: "tool", content: "ok", tool_call_id: "tc2" },
        msg("user", "done"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const merged = parsed.find((m) =>
        m.content && m.content.includes("repetitive read/edit cycle")
      );
      expect(merged).toBeUndefined();
    });
  });

  describe("maxMessages limit", () => {
    it("reduces messages to maxMessages count", () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `message ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 4 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      expect(parsed.length).toBeLessThanOrEqual(4 + 1);
    });

    it("keeps most recent messages when trimming", () => {
      const messages = [
        msg("user", "old message"),
        msg("assistant", "old reply"),
        msg("user", "new message"),
        msg("assistant", "new reply"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 2 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const hasNew = parsed.some((m) => m.content === "new reply");
      expect(hasNew).toBe(true);
    });

    it("inserts summary message when messages are removed", () => {
      const messages = Array.from({ length: 8 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 3 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const summary = parsed.find((m) =>
        m.content && m.content.includes("earlier messages removed")
      );
      expect(summary).toBeDefined();
    });

    it("does not trim when messages count is within limit", () => {
      const messages = [msg("user", "a"), msg("assistant", "b")];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 5 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const meta = result.metadata as Record<string, unknown>;

      expect(meta.messagesOriginal).toBe(2);
      expect(parsed.length).toBe(2);
    });

    it("ignores invalid maxMessages values", () => {
      const messages = [msg("user", "a"), msg("assistant", "b")];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: -1 });
      const parsed = parseOutput(result);

      expect(parsed).toHaveLength(2);
    });
  });

  describe("maxTokens limit", () => {
    it("reduces output to fit within token budget", () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `message ${i}: ${longString(200)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxTokens: 100 });

      const outputTokens = Math.ceil(result.output.length / 4);
      expect(outputTokens).toBeLessThanOrEqual(100);
    });

    it("preserves system messages when trimming for tokens", () => {
      const messages = [
        msg("system", "you are helpful"),
        ...Array.from({ length: 10 }, (_, i) =>
          msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}: ${longString(100)}`)
        ),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxTokens: 50 });
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      const sysMsg = parsed.find((m) => m.content === "you are helpful");
      expect(sysMsg).toBeDefined();
    });
  });

  describe("maxLines limit", () => {
    it("reduces output when pretty-printed lines exceed limit", () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `message ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxLines: 10 });
      const meta = result.metadata as Record<string, unknown>;

      expect((meta.messagesCompressed as number)).toBeLessThan(meta.messagesOriginal as number);
    });

    it("does not trim when within line limit", () => {
      const messages = [msg("user", "hi"), msg("assistant", "hello")];
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxLines: 1000 });
      const parsed = parseOutput(result);

      expect(parsed).toHaveLength(2);
    });
  });

  describe("metadata accuracy", () => {
    it("tracks messagesOriginal correctly", () => {
      const messages = Array.from({ length: 7 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;

      expect(meta.messagesOriginal).toBe(7);
    });

    it("tracks messagesCompressed correctly after maxMessages", () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, { maxMessages: 4 });
      const meta = result.metadata as Record<string, unknown>;
      const parsed = parseOutput(result);

      expect(meta.messagesCompressed).toBe(parsed.length);
    });

    it("reports zero anchors when none present", () => {
      const input = buildSession([msg("user", "hello"), msg("assistant", "world")]);
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;

      expect(meta.anchorsPreserved).toBe(0);
    });

    it("reports correct anchor count with mixed markers", () => {
      const messages = [
        msg("user", "[IMPORTANT] a"),
        msg("assistant", "b"),
        msg("user", "[PIN] c"),
        msg("assistant", "d"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);
      const meta = result.metadata as Record<string, unknown>;

      expect(meta.anchorsPreserved).toBe(2);
    });
  });

  describe("combined options", () => {
    it("applies strategy and maxMessages together", () => {
      const messages = Array.from({ length: 15 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}: ${longString(300)}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, {
        strategy: "time-decay",
        maxMessages: 6,
      });
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      const meta = result.metadata as Record<string, unknown>;

      expect(meta.strategy).toBe("time-decay");
      expect(parsed.length).toBeLessThanOrEqual(7);
    });

    it("applies maxMessages and maxTokens together", () => {
      const messages = Array.from({ length: 10 }, (_, i) =>
        msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
      );
      const input = buildSession(messages);
      const result = compressor.compress(input, {
        maxMessages: 8,
        maxTokens: 50,
      });

      const tokens = Math.ceil(result.output.length / 4);
      expect(tokens).toBeLessThanOrEqual(50);
    });
  });

  describe("special content handling", () => {
    it("handles messages with unicode content", () => {
      const input = buildSession([
        msg("user", "你好世界 🌍"),
        msg("assistant", "こんにちは 🎌"),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;

      expect(parsed[0].content).toBe("你好世界 🌍");
      expect(parsed[1].content).toBe("こんにちは 🎌");
    });

    it("handles messages with special JSON characters", () => {
      const input = buildSession([
        msg("user", 'test "quoted" and \\backslash\\'),
        msg("assistant", "line1\nline2\ttab"),
      ]);
      const result = compressor.compress(input);
      expect(() => JSON.parse(result.output)).not.toThrow();
    });

    it("handles nested tool_calls in assistant messages", () => {
      const input = buildSession([
        msg("user", "do something"),
        {
          role: "assistant",
          content: "I'll help",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"test.ts"}' },
            },
            {
              id: "call_2",
              type: "function",
              function: { name: "write_file", arguments: '{"path":"out.ts","content":"hello"}' },
            },
          ],
        },
        { role: "tool", content: "file content", tool_call_id: "call_1" },
        { role: "tool", content: "written", tool_call_id: "call_2" },
      ]);
      const result = compressor.compress(input);
      expect(() => JSON.parse(result.output)).not.toThrow();
      const parsed = parseOutput(result) as Array<Record<string, unknown>>;
      const assistantMsg = parsed.find((m) => m.role === "assistant" && m.tool_calls);
      expect(assistantMsg).toBeDefined();
    });

    it("preserves extra properties on messages", () => {
      const input = buildSession([
        { role: "user", content: "hello", customField: "keep-me" },
        msg("assistant", "hi"),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, unknown>>;
      const userMsg = parsed.find((m) => m.role === "user");

      expect(userMsg!.customField).toBe("keep-me");
    });

    it("handles messages with only whitespace content", () => {
      const input = buildSession([
        msg("user", "   \n\t  "),
        msg("assistant", "reply"),
      ]);
      const result = compressor.compress(input);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      expect(parsed).toHaveLength(2);
    });
  });

  describe("no compressible content", () => {
    it("returns with minimal overhead when nothing to compress", () => {
      const messages = [
        msg("user", "hello"),
        msg("assistant", "hi there"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);

      expect(result.ratio).toBeGreaterThan(0.5);
      const parsed = parseOutput(result) as Array<Record<string, string>>;
      expect(parsed[0].content).toBe("hello");
      expect(parsed[1].content).toBe("hi there");
    });

    it("ratio is close to 1 for incompressible short sessions", () => {
      const messages = [
        msg("user", "hi"),
        msg("assistant", "hello"),
      ];
      const input = buildSession(messages);
      const result = compressor.compress(input);

      expect(result.ratio).toBeGreaterThan(0.8);
      expect(result.ratio).toBeLessThanOrEqual(1.1);
    });
  });
});
