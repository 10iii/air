import type { CompressResult } from "../types.js";
import { estimateTokens } from "../utils/index.js";
import { sanitizePositiveInt } from "./shared.js";

export interface SessionOptions {
  maxLines?: number;
  maxTokens?: number;
  maxMessages?: number;
  strategy?: "time-decay" | "tool-focused" | "balanced";
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
  [key: string]: unknown;
}

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

const ANCHOR_MARKERS = ["[IMPORTANT]", "[PIN]"];
const TOOL_RESULT_THRESHOLD = 200;
const LONG_MESSAGE_THRESHOLD = 10000;

function hasAnchorMarker(content: string | null): boolean {
  if (!content) return false;
  return ANCHOR_MARKERS.some((marker) => content.includes(marker));
}

function isSystemMessage(msg: ChatMessage): boolean {
  return msg.role === "system";
}

function isToolResultMessage(msg: ChatMessage): boolean {
  return msg.role === "tool";
}

function summarizeContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  const firstLine = content.split("\n")[0] ?? "";
  const preview = firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine;
  return preview;
}

function compressToolResult(msg: ChatMessage): ChatMessage {
  if (!isToolResultMessage(msg)) return msg;
  const content = msg.content;
  if (typeof content !== "string" || content.length <= TOOL_RESULT_THRESHOLD) return msg;

  const originalLen = content.length;
  const summary = summarizeContent(content, 100);
  const compressed = `[air-compressed: ${originalLen}\u2192${summary.length + 40} chars] ${summary}`;

  return { ...msg, content: compressed };
}

function truncateLongMessage(msg: ChatMessage): ChatMessage {
  const content = msg.content;
  if (typeof content !== "string" || content.length <= LONG_MESSAGE_THRESHOLD) return msg;

  const truncated = content.slice(0, LONG_MESSAGE_THRESHOLD);
  const remaining = content.length - LONG_MESSAGE_THRESHOLD;
  return { ...msg, content: `${truncated}\n[truncated: ${remaining} chars]` };
}

function detectRepetitionCycles(messages: ChatMessage[]): Set<number> {
  const cycleIndices = new Set<number>();

  const toolCallPattern: { index: number; name: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        toolCallPattern.push({ index: i, name: tc.function.name.toLowerCase() });
      }
    }
  }

  let cycleStart = -1;
  let cycleCount = 0;
  const readEditPattern: number[] = [];

  for (let i = 0; i < toolCallPattern.length; i++) {
    const entry = toolCallPattern[i];
    const isRead = entry.name.includes("read") || entry.name.includes("get") || entry.name.includes("fetch");
    const isEdit = entry.name.includes("edit") || entry.name.includes("write") || entry.name.includes("update");

    if (isRead && cycleStart === -1) {
      cycleStart = i;
      readEditPattern.push(entry.index);
    } else if (isEdit && cycleStart !== -1) {
      readEditPattern.push(entry.index);
      cycleCount++;
      cycleStart = -1;
    } else if (!isRead && !isEdit) {
      if (cycleCount >= 2) {
        const toMark = readEditPattern.slice(0, -2);
        for (const idx of toMark) {
          cycleIndices.add(idx);
          if (idx + 1 < messages.length && messages[idx + 1].role === "tool") {
            cycleIndices.add(idx + 1);
          }
        }
      }
      cycleStart = -1;
      cycleCount = 0;
      readEditPattern.length = 0;
    }
  }

  if (cycleCount >= 2) {
    const toMark = readEditPattern.slice(0, -2);
    for (const idx of toMark) {
      cycleIndices.add(idx);
      if (idx + 1 < messages.length && messages[idx + 1].role === "tool") {
        cycleIndices.add(idx + 1);
      }
    }
  }

  return cycleIndices;
}

function applyTimeDecay(messages: ChatMessage[]): ChatMessage[] {
  const total = messages.length;
  if (total <= 3) return messages;

  const firstThird = Math.floor(total / 3);
  const secondThird = Math.floor((total * 2) / 3);

  return messages.map((msg, i) => {
    if (isSystemMessage(msg) || hasAnchorMarker(msg.content)) return msg;

    const content = msg.content;
    if (typeof content !== "string" || content.length === 0) return msg;

    if (i < firstThird) {
      if (content.length > 200) {
        const preview = content.slice(0, 150);
        return {
          ...msg,
          content: `${preview}...\n[air-compressed: time-decay, ${content.length}\u2192${preview.length + 30} chars]`,
        };
      }
    } else if (i < secondThird) {
      if (content.length > 500) {
        const preview = content.slice(0, 400);
        return {
          ...msg,
          content: `${preview}...\n[air-compressed: time-decay, ${content.length}\u2192${preview.length + 30} chars]`,
        };
      }
    }
    return msg;
  });
}

function applyToolFocused(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    if (isSystemMessage(msg) || hasAnchorMarker(msg.content)) return msg;

    if (isToolResultMessage(msg)) {
      return compressToolResult(msg);
    }

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const compressedCalls = msg.tool_calls.map((tc) => {
        const args = tc.function.arguments;
        if (args.length > 200) {
          return {
            ...tc,
            function: {
              ...tc.function,
              arguments: `[air-compressed: ${args.length} chars]`,
            },
          };
        }
        return tc;
      });
      return { ...msg, tool_calls: compressedCalls };
    }

    return msg;
  });
}

function applyBalanced(messages: ChatMessage[]): ChatMessage[] {
  let result = messages.map((msg) => {
    if (isSystemMessage(msg) || hasAnchorMarker(msg.content)) return msg;

    if (isToolResultMessage(msg)) {
      return compressToolResult(msg);
    }

    return msg;
  });

  const total = result.length;
  if (total > 6) {
    const firstThird = Math.floor(total / 3);
    result = result.map((msg, i) => {
      if (isSystemMessage(msg) || hasAnchorMarker(msg.content)) return msg;
      const content = msg.content;
      if (typeof content !== "string" || content.length === 0) return msg;

      if (i < firstThird && content.length > 500) {
        const preview = content.slice(0, 300);
        return {
          ...msg,
          content: `${preview}...\n[air-compressed: balanced, ${content.length}\u2192${preview.length + 30} chars]`,
        };
      }
      return msg;
    });
  }

  return result;
}

function applyMaxMessages(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (messages.length <= maxMessages) return messages;

  const preserved: { msg: ChatMessage; originalIndex: number }[] = [];
  const removable: { msg: ChatMessage; originalIndex: number }[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (isSystemMessage(msg) || hasAnchorMarker(msg.content)) {
      preserved.push({ msg, originalIndex: i });
    } else {
      removable.push({ msg, originalIndex: i });
    }
  }

  const removableSlots = Math.max(0, maxMessages - preserved.length);
  const keptRemovable = removable.slice(-removableSlots);

  const all = [...preserved, ...keptRemovable].sort(
    (a, b) => a.originalIndex - b.originalIndex
  );

  const result = all.map((entry) => entry.msg);

  const removedCount = messages.length - result.length;
  if (removedCount > 0) {
    let insertIndex = 0;
    while (insertIndex < result.length && isSystemMessage(result[insertIndex])) {
      insertIndex++;
    }
    const summaryMsg: ChatMessage = {
      role: "system",
      content: `[air-compressed: ${removedCount} earlier messages removed to fit maxMessages=${maxMessages}]`,
    };
    result.splice(insertIndex, 0, summaryMsg);
  }

  return result;
}

export class SessionCompressor {
  compress(content: string, options?: SessionOptions): CompressResult {
    const originalSize = content.split("\n").length;
    const strategy = options?.strategy ?? "balanced";
    const maxMessages = sanitizePositiveInt(options?.maxMessages);
    const maxLines = sanitizePositiveInt(options?.maxLines);
    const maxTokens = sanitizePositiveInt(options?.maxTokens);

    let messages: ChatMessage[];
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return this.buildErrorResult(content, "Input is not a JSON array");
      }
      messages = parsed as ChatMessage[];
    } catch {
      return this.buildErrorResult(content, "Invalid JSON input");
    }

    const messagesOriginal = messages.length;

    if (messages.length === 0) {
      const output = "[]";
      return {
        output,
        originalSize,
        compressedSize: output.split("\n").length,
        ratio: originalSize > 0 ? output.split("\n").length / originalSize : 1,
        format: "air-session",
        metadata: {
          messagesOriginal: 0,
          messagesCompressed: 0,
          strategy,
          anchorsPreserved: 0,
        },
      };
    }

    if (messages.length === 1) {
      const output = JSON.stringify(messages);
      const compressedSize = output.split("\n").length;
      return {
        output,
        originalSize,
        compressedSize,
        ratio: originalSize > 0 ? compressedSize / originalSize : 1,
        format: "air-session",
        metadata: {
          messagesOriginal: 1,
          messagesCompressed: 1,
          strategy,
          anchorsPreserved: hasAnchorMarker(messages[0].content) ? 1 : 0,
        },
      };
    }

    const anchorsPreserved = messages.filter((m) => hasAnchorMarker(m.content)).length;

    messages = messages.map(truncateLongMessage);

    const cycleIndices = detectRepetitionCycles(messages);
    if (cycleIndices.size > 0) {
      const cycleIndicesArr = Array.from(cycleIndices);
      const cycleMessages: ChatMessage[] = [];
      for (const idx of cycleIndicesArr) {
        if (!isSystemMessage(messages[idx]) && !hasAnchorMarker(messages[idx].content)) {
          cycleMessages.push(messages[idx]);
        }
      }

      if (cycleMessages.length > 0) {
        const summaryMsg: ChatMessage = {
          role: "assistant",
          content: `[air-compressed: ${cycleMessages.length} repetitive read/edit cycle messages merged]`,
        };

        const sortedCycleIndices = cycleIndicesArr.sort((a, b) => a - b);
        const firstCycleIdx = sortedCycleIndices[0];

        const filtered: ChatMessage[] = [];
        let summaryInserted = false;
        for (let i = 0; i < messages.length; i++) {
          if (cycleIndices.has(i) && !isSystemMessage(messages[i]) && !hasAnchorMarker(messages[i].content)) {
            if (!summaryInserted && i === firstCycleIdx) {
              filtered.push(summaryMsg);
              summaryInserted = true;
            }
            continue;
          }
          filtered.push(messages[i]);
        }
        messages = filtered;
      }
    }

    switch (strategy) {
      case "time-decay":
        messages = applyTimeDecay(messages);
        break;
      case "tool-focused":
        messages = applyToolFocused(messages);
        break;
      case "balanced":
      default:
        messages = applyBalanced(messages);
        break;
    }

    if (maxMessages !== undefined) {
      messages = applyMaxMessages(messages, maxMessages);
    }

    let output = JSON.stringify(messages);

    if (maxLines !== undefined) {
      const prettyOutput = JSON.stringify(messages, null, 2);
      const lines = prettyOutput.split("\n");
      if (lines.length > maxLines) {
        const systemMsgs = messages.filter((m) => isSystemMessage(m));
        const nonSystemMsgs = messages.filter((m) => !isSystemMessage(m));
        let lo = 0, hi = nonSystemMsgs.length;
        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
          const trial = [...systemMsgs, ...nonSystemMsgs.slice(nonSystemMsgs.length - mid)];
          const trialOutput = JSON.stringify(trial, null, 2);
          if (trialOutput.split("\n").length <= maxLines) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        messages = [...systemMsgs, ...nonSystemMsgs.slice(nonSystemMsgs.length - Math.max(0, lo))];
        output = JSON.stringify(messages);
      }
    }

    if (maxTokens !== undefined) {
      let tokens = estimateTokens(output);
      if (tokens > maxTokens) {
        // Separate system messages (always preserved) from non-system messages
        const systemMsgs = messages.filter((m) => isSystemMessage(m));
        const nonSystemMsgs = messages.filter((m) => !isSystemMessage(m));
        // Binary search for optimal non-system message count, keeping most recent
        let lo = 0, hi = nonSystemMsgs.length;
        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
          const trial = [...systemMsgs, ...nonSystemMsgs.slice(nonSystemMsgs.length - mid)];
          const trialOutput = JSON.stringify(trial);
          if (estimateTokens(trialOutput) <= maxTokens) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        messages = [...systemMsgs, ...nonSystemMsgs.slice(nonSystemMsgs.length - Math.max(0, lo))];
        output = JSON.stringify(messages);
      }
    }

    output = JSON.stringify(messages);
    const compressedSize = output.split("\n").length;
    const messagesCompressed = messages.length;

    return {
      output,
      originalSize,
      compressedSize,
      ratio: originalSize > 0 ? compressedSize / originalSize : 1,
      format: "air-session",
      metadata: {
        messagesOriginal,
        messagesCompressed,
        strategy,
        anchorsPreserved,
      },
    };
  }

  private buildErrorResult(content: string, errorMessage: string): CompressResult {
    const output = JSON.stringify({ error: errorMessage });
    const originalSize = content.split("\n").length;
    const compressedSize = output.split("\n").length;
    return {
      output,
      originalSize,
      compressedSize,
      ratio: originalSize > 0 ? compressedSize / originalSize : 1,
      format: "air-session",
      metadata: {
        messagesOriginal: 0,
        messagesCompressed: 0,
        strategy: "balanced",
        anchorsPreserved: 0,
        error: errorMessage,
      },
    };
  }
}
