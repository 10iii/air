import { describe, it, expect } from "vitest";
import { MediaCompressor } from "../compressors/media.js";
import type { MediaOptions } from "../compressors/media.js";

function srt(...blocks: [number, string, string][]): string {
  return blocks
    .map(([seq, ts, text]) => `${seq}\n${ts}\n${text}\n`)
    .join("\n");
}

function vtt(...cues: [string, string][]): string {
  const body = cues.map(([ts, text]) => `${ts}\n${text}\n`).join("\n");
  return `WEBVTT\n\n${body}`;
}

describe("MediaCompressor", () => {
  const compressor = new MediaCompressor();

  describe("empty and trivial input", () => {
    it("returns empty output for empty string", () => {
      const result = compressor.compress("");
      expect(result.output).toBe("");
      expect(result.originalSize).toBe(1);
      expect(result.compressedSize).toBe(0);
      expect(result.format).toBe("air-media");
      expect(result.ratio).toBe(1);
    });

    it("returns empty output for whitespace-only input", () => {
      const result = compressor.compress("   \n  \n   ");
      expect(result.output).toBe("");
      expect(result.metadata!.detectedFormat).toBe("text");
    });

    it("handles single word input", () => {
      const result = compressor.compress("Hello");
      expect(result.output).toContain("Hello");
    });
  });

  describe("format auto-detection", () => {
    it("detects SRT format (sequence numbers + timestamps)", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello world"],
        [2, "00:00:02,500 --> 00:00:05,000", "Goodbye world"]
      );
      const result = compressor.compress(input);
      expect(result.metadata!.detectedFormat).toBe("srt");
    });

    it("detects VTT format (WEBVTT header)", () => {
      const input = vtt(
        ["00:00:00.000 --> 00:00:02.500", "Hello world"],
        ["00:00:02.500 --> 00:00:05.000", "Goodbye world"]
      );
      const result = compressor.compress(input);
      expect(result.metadata!.detectedFormat).toBe("vtt");
    });

    it("detects plain text format", () => {
      const input = "Just some regular text\nwith multiple lines.";
      const result = compressor.compress(input);
      expect(result.metadata!.detectedFormat).toBe("text");
    });

    it("respects explicit format override", () => {
      const input = "Not really SRT but forcing it";
      const result = compressor.compress(input, { format: "srt" });
      expect(result.metadata!.detectedFormat).toBe("srt");
    });

    it("detects SRT even without sequence numbers (malformed)", () => {
      const input = "00:00:00,000 --> 00:00:02,500\nHello\n\n00:00:02,500 --> 00:00:05,000\nWorld";
      const result = compressor.compress(input);
      expect(result.metadata!.detectedFormat).toBe("srt");
    });
  });

  describe("SRT parsing and timestamp removal", () => {
    it("removes sequence numbers and timestamps from SRT", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello everyone, welcome to the show."],
        [2, "00:00:02,500 --> 00:00:05,000", "Today we talk about AI."]
      );
      const result = compressor.compress(input, { removeFillerWords: false, mergeSpeakers: false });
      expect(result.output).toContain("Hello everyone, welcome to the show.");
      expect(result.output).toContain("Today we talk about AI.");
      expect(result.output).not.toContain("00:00");
      expect(result.output).not.toMatch(/^\d+$/m);
    });

    it("preserves timestamps when removeTimestamps is false", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello"]
      );
      const result = compressor.compress(input, { removeTimestamps: false, removeFillerWords: false });
      expect(result.output).toContain("00:00:00,000 --> 00:00:02,500");
    });

    it("counts removed timestamps in metadata", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello"],
        [2, "00:00:02,500 --> 00:00:05,000", "World"]
      );
      const result = compressor.compress(input, { removeFillerWords: false });
      expect((result.metadata!.timestampsRemoved as number)).toBeGreaterThanOrEqual(4);
    });
  });

  describe("VTT parsing", () => {
    it("removes WEBVTT header and timestamps", () => {
      const input = vtt(
        ["00:00:00.000 --> 00:00:02.500", "Hello world"],
        ["00:00:02.500 --> 00:00:05.000", "Goodbye world"]
      );
      const result = compressor.compress(input, { removeFillerWords: false, mergeSpeakers: false });
      expect(result.output).not.toContain("WEBVTT");
      expect(result.output).not.toContain("00:00");
      expect(result.output).toContain("Hello world");
      expect(result.output).toContain("Goodbye world");
    });

    it("handles VTT with metadata after header", () => {
      const input = "WEBVTT\nKind: captions\nLanguage: en\n\n00:00:00.000 --> 00:00:02.500\nHello";
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).not.toContain("Kind:");
      expect(result.output).toContain("Hello");
    });
  });

  describe("filler word removal - English", () => {
    it("removes 'um' and 'uh' from text", () => {
      const result = compressor.compress("Well um I think uh this is good", {
        removeTimestamps: false,
        language: "en",
      });
      expect(result.output).toContain("Well");
      expect(result.output).toContain("I think");
      expect(result.output).toContain("this is good");
      expect(result.output).not.toMatch(/\bum\b/i);
      expect(result.output).not.toMatch(/\buh\b/i);
    });

    it("removes 'er' and 'ah' from text", () => {
      const result = compressor.compress("So er the thing is ah very important", {
        removeTimestamps: false,
        language: "en",
      });
      expect(result.output).not.toMatch(/\ber\b/i);
      expect(result.output).not.toMatch(/\bah\b/i);
    });

    it("removes 'you know' and 'I mean'", () => {
      const result = compressor.compress(
        "So you know the thing is I mean we should go",
        { removeTimestamps: false, language: "en" }
      );
      expect(result.output).not.toContain("you know");
      expect(result.output).not.toContain("I mean");
      expect(result.output).toContain("the thing is");
    });

    it("removes 'sort of' and 'kind of' as fillers", () => {
      const result = compressor.compress(
        "It was sort of interesting and kind of weird",
        { removeTimestamps: false, language: "en" }
      );
      expect(result.output).not.toContain("sort of");
      expect(result.output).not.toContain("kind of");
    });

    it("removes 'like' used as filler (with commas)", () => {
      const result = compressor.compress(
        "It was, like, really amazing",
        { removeTimestamps: false, language: "en" }
      );
      expect(result.output).not.toMatch(/,\s*like\s*,/i);
    });

    it("preserves fillers when removeFillerWords is false", () => {
      const result = compressor.compress("I think um we should go", {
        removeFillerWords: false,
        removeTimestamps: false,
      });
      expect(result.output).toContain("um");
    });
  });

  describe("filler word removal - Chinese", () => {
    it("removes Chinese filler words", () => {
      const result = compressor.compress(
        "嗯我觉得那个这个方案就是说还不错然后呢我们继续啊",
        { removeTimestamps: false, language: "zh" }
      );
      expect(result.output).not.toContain("嗯");
      expect(result.output).not.toContain("那个");
      expect(result.output).not.toContain("这个");
      expect(result.output).not.toContain("就是说");
      expect(result.output).not.toContain("然后呢");
      expect(result.output).not.toContain("啊");
      expect(result.output).toContain("我觉得");
      expect(result.output).toContain("方案");
    });

    it("handles mixed language fillers in auto mode", () => {
      const result = compressor.compress(
        "So um 嗯 we need to 那个 figure this out",
        { removeTimestamps: false, language: "auto" }
      );
      expect(result.output).not.toMatch(/\bum\b/i);
      expect(result.output).not.toContain("嗯");
      expect(result.output).not.toContain("那个");
    });
  });

  describe("speaker label handling", () => {
    it("does not remove speaker labels by default", () => {
      const result = compressor.compress("Speaker 1: Hello there", {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.output).toContain("Speaker 1:");
    });

    it("removes speaker labels when enabled", () => {
      const input = "Speaker 1: Hello\nSpeaker 2: World";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        removeSpeakerLabels: true,
        mergeSpeakers: false,
      });
      expect(result.output).not.toContain("Speaker 1:");
      expect(result.output).not.toContain("Speaker 2:");
      expect(result.output).toContain("Hello");
      expect(result.output).toContain("World");
    });

    it("removes bracketed speaker labels", () => {
      const input = "[John]: Hello\n[Jane]: Hi there";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        removeSpeakerLabels: true,
        mergeSpeakers: false,
      });
      expect(result.output).not.toContain("[John]");
      expect(result.output).not.toContain("[Jane]");
    });

    it("removes SPEAKER_00 style labels", () => {
      const input = "SPEAKER_00: First line\nSPEAKER_01: Second line";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        removeSpeakerLabels: true,
        mergeSpeakers: false,
      });
      expect(result.output).not.toContain("SPEAKER_00:");
      expect(result.output).toContain("First line");
    });
  });

  describe("speaker merging", () => {
    it("merges consecutive lines from same speaker", () => {
      const input = "Speaker 1: Hello\nSpeaker 1: How are you";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: true,
        removeSpeakerLabels: false,
      });
      const lines = result.output.split("\n").filter((l) => !l.startsWith("---"));
      expect(lines.length).toBeLessThanOrEqual(2);
    });

    it("does not merge lines from different speakers", () => {
      const input = "Speaker 1: Hello\nSpeaker 2: Hi there";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: true,
        removeSpeakerLabels: false,
      });
      expect(result.output).toContain("Speaker 1:");
      expect(result.output).toContain("Speaker 2:");
    });

    it("does not merge when mergeSpeakers is false", () => {
      const input = "Hello\nWorld\nTest";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.output).toContain("Hello");
      expect(result.output).toContain("World");
      expect(result.output).toContain("Test");
    });

    it("tracks number of speaker merges in metadata", () => {
      const input = "Hello\nWorld\nTest";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: true,
      });
      expect(result.metadata!.speakersMerged).toBeGreaterThanOrEqual(0);
    });
  });

  describe("duplicate line removal", () => {
    it("removes exact consecutive duplicates", () => {
      const input = "Hello everyone\nHello everyone\nWelcome";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      const outputLines = result.output
        .split("\n")
        .filter((l) => !l.startsWith("---") && l.trim() !== "");
      const helloCount = outputLines.filter((l) => l.includes("Hello everyone")).length;
      expect(helloCount).toBe(1);
      expect(result.metadata!.duplicatesRemoved).toBeGreaterThanOrEqual(1);
    });

    it("removes near-duplicate lines (progressive auto-captions)", () => {
      const input = "Hello\nHello everyone\nHello everyone, welcome";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.metadata!.duplicatesRemoved).toBeGreaterThanOrEqual(1);
    });

    it("keeps the longer version of near-duplicates", () => {
      const input = "Hello\nHello everyone";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.output).toContain("Hello everyone");
    });

    it("does not remove non-consecutive duplicates", () => {
      const input = "Hello\nWorld\nHello";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      const helloCount = result.output
        .split("\n")
        .filter((l) => l.trim() === "Hello").length;
      expect(helloCount).toBe(2);
    });
  });

  describe("HTML tag stripping", () => {
    it("strips italic tags from subtitles", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "<i>Hello world</i>"]
      );
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("Hello world");
      expect(result.output).not.toContain("<i>");
      expect(result.output).not.toContain("</i>");
    });

    it("strips bold and other HTML tags", () => {
      const input = "Normal <b>bold</b> and <font color='red'>colored</font> text";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
      });
      expect(result.output).toContain("Normal bold and colored text");
      expect(result.output).not.toContain("<b>");
      expect(result.output).not.toContain("<font");
    });
  });

  describe("blank line collapsing", () => {
    it("collapses multiple blank lines into one paragraph break", () => {
      const input = "First paragraph\n\n\n\n\nSecond paragraph";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      const consecutive = result.output.match(/\n\n\n/);
      expect(consecutive).toBeNull();
    });
  });

  describe("full SRT workflow", () => {
    it("processes complete SRT with fillers and timestamps", () => {
      const input = [
        "1",
        "00:00:00,000 --> 00:00:02,500",
        "Hello everyone, um, welcome to the show.",
        "",
        "2",
        "00:00:02,500 --> 00:00:05,000",
        "Today we're going to, you know, talk about AI.",
      ].join("\n");
      const result = compressor.compress(input, { language: "en" });
      expect(result.output).not.toContain("00:00");
      expect(result.output).not.toMatch(/\bum\b/i);
      expect(result.output).not.toContain("you know");
      expect(result.output).toContain("Hello everyone");
      expect(result.output).toContain("welcome to the show");
      expect(result.output).toContain("talk about AI");
    });
  });

  describe("full VTT workflow", () => {
    it("deduplicates progressive auto-captions in VTT", () => {
      const input = [
        "WEBVTT",
        "",
        "00:00:00.000 --> 00:00:02.500",
        "Hello everyone",
        "",
        "00:00:02.500 --> 00:00:05.000",
        "Hello everyone, welcome",
      ].join("\n");
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("Hello everyone, welcome");
      expect(result.metadata!.duplicatesRemoved).toBeGreaterThanOrEqual(1);
    });
  });

  describe("CompressResult structure", () => {
    it("has correct format field", () => {
      const result = compressor.compress("Some text");
      expect(result.format).toBe("air-media");
    });

    it("has correct originalSize (line count)", () => {
      const input = "Hello world";
      const result = compressor.compress(input);
      expect(result.originalSize).toBe(input.split("\n").length);
    });

    it("compressedSize is line count of output text", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello"]
      );
      const result = compressor.compress(input);
      const contentLines = result.output.split("\n").filter((l) => !l.startsWith("--- air:"));
      expect(result.compressedSize).toBe(contentLines.length);
    });

    it("ratio is compressedSize / originalSize", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Hello"],
        [2, "00:00:02,500 --> 00:00:05,000", "World"]
      );
      const result = compressor.compress(input);
      expect(result.ratio).toBe(result.compressedSize / result.originalSize);
    });

    it("includes metadata with all required fields", () => {
      const result = compressor.compress("Some text");
      expect(result.metadata).toBeDefined();
      expect(result.metadata).toHaveProperty("detectedFormat");
      expect(result.metadata).toHaveProperty("timestampsRemoved");
      expect(result.metadata).toHaveProperty("fillerWordsRemoved");
      expect(result.metadata).toHaveProperty("duplicatesRemoved");
      expect(result.metadata).toHaveProperty("speakersMerged");
    });

    it("includes stats line in output by default", () => {
      const result = compressor.compress("Hello world");
      expect(result.output).toContain("--- air:");
      expect(result.output).toContain("saved) ---");
    });
  });

  describe("maxLines truncation", () => {
    it("truncates output to maxLines", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      const input = lines.join("\n");
      const result = compressor.compress(input, {
        maxLines: 5,
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      const outputLines = result.output.split("\n");
      expect(outputLines.length).toBeLessThanOrEqual(6);
    });

    it("includes omission marker when truncated", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      const input = lines.join("\n");
      const result = compressor.compress(input, {
        maxLines: 5,
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.output).toContain("omitted");
    });
  });

  describe("maxTokens truncation", () => {
    it("respects maxTokens budget", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `This is a longer line number ${i + 1} with more content`);
      const input = lines.join("\n");
      const result = compressor.compress(input, {
        maxTokens: 50,
        removeTimestamps: false,
        removeFillerWords: false,
        mergeSpeakers: false,
      });
      expect(result.output.length).toBeLessThan(input.length);
    });
  });

  describe("edge cases", () => {
    it("handles CRLF line endings", () => {
      const input = "1\r\n00:00:00,000 --> 00:00:02,500\r\nHello\r\n";
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("Hello");
      expect(result.output).not.toContain("\r");
    });

    it("preserves Unicode content", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "\u4F60\u597D\u4E16\u754C\uFF0C\u6B22\u8FCE\u5149\u4E34"]
      );
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("\u4F60\u597D\u4E16\u754C");
      expect(result.output).toContain("\u6B22\u8FCE\u5149\u4E34");
    });

    it("handles already clean text with no timestamps", () => {
      const input = "This is already clean text.\nNo timestamps here.";
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("This is already clean text.");
      expect((result.metadata!.timestampsRemoved as number)).toBe(0);
    });

    it("handles malformed SRT with missing sequence numbers", () => {
      const input = "00:00:00,000 --> 00:00:02,500\nHello\n\n00:00:02,500 --> 00:00:05,000\nWorld";
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("Hello");
      expect(result.output).toContain("World");
      expect(result.output).not.toContain("00:00");
    });

    it("handles very long input efficiently", () => {
      const blocks = Array.from(
        { length: 1000 },
        (_, i) => `${i + 1}\n00:00:${String(i).padStart(2, "0")},000 --> 00:00:${String(i + 1).padStart(2, "0")},000\nLine ${i + 1}`
      );
      const input = blocks.join("\n\n");
      const start = Date.now();
      const result = compressor.compress(input, { removeFillerWords: false });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
      expect(result.output).toContain("Line 1");
    });

    it("handles input with only timestamps (no text)", () => {
      const input = "1\n00:00:00,000 --> 00:00:02,500\n\n2\n00:00:02,500 --> 00:00:05,000\n";
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.metadata!.timestampsRemoved).toBeGreaterThan(0);
    });

    it("handles emoji content", () => {
      const input = srt(
        [1, "00:00:00,000 --> 00:00:02,500", "Great job! \uD83D\uDE0A\uD83D\uDC4D"]
      );
      const result = compressor.compress(input, { removeFillerWords: false });
      expect(result.output).toContain("\uD83D\uDE0A");
      expect(result.output).toContain("\uD83D\uDC4D");
    });

    it("sanitizes invalid maxLines (negative, zero)", () => {
      const result = compressor.compress("Hello\nWorld", { maxLines: -1 });
      expect(result.output).toContain("Hello");
    });

    it("sanitizes invalid maxLines (NaN, Infinity)", () => {
      const result1 = compressor.compress("Hello", { maxLines: NaN });
      expect(result1.output).toContain("Hello");
      const result2 = compressor.compress("Hello", { maxLines: Infinity });
      expect(result2.output).toContain("Hello");
    });

    it("sanitizes invalid maxTokens", () => {
      const result = compressor.compress("Hello", { maxTokens: -5 });
      expect(result.output).toContain("Hello");
    });
  });

  describe("language option", () => {
    it("only removes English fillers when language is 'en'", () => {
      const input = "\u55EF this is um a test";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        language: "en",
      });
      expect(result.output).toContain("\u55EF");
      expect(result.output).not.toMatch(/\bum\b/i);
    });

    it("only removes Chinese fillers when language is 'zh'", () => {
      const input = "\u55EF this is um a test";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        language: "zh",
      });
      expect(result.output).not.toContain("\u55EF");
      expect(result.output).toContain("um");
    });

    it("removes both en and zh fillers in auto mode", () => {
      const input = "\u55EF um hello \u90A3\u4E2A world";
      const result = compressor.compress(input, {
        removeTimestamps: false,
        language: "auto",
      });
      expect(result.output).not.toContain("\u55EF");
      expect(result.output).not.toMatch(/\bum\b/i);
      expect(result.output).not.toContain("\u90A3\u4E2A");
    });
  });

  describe("combined features in realistic scenarios", () => {
    it("handles full SRT with speakers, fillers, and duplicates", () => {
      const input = [
        "1",
        "00:00:00,000 --> 00:00:02,500",
        "Speaker 1: Hello everyone",
        "",
        "2",
        "00:00:02,500 --> 00:00:05,000",
        "Speaker 1: Hello everyone, um, welcome",
        "",
        "3",
        "00:00:05,000 --> 00:00:08,000",
        "Speaker 2: Thanks, you know, for having me",
      ].join("\n");
      const result = compressor.compress(input, {
        removeSpeakerLabels: true,
        language: "en",
      });
      expect(result.output).not.toContain("00:00");
      expect(result.output).not.toContain("Speaker");
      expect(result.output).not.toMatch(/\bum\b/i);
      expect(result.output).not.toContain("you know");
      expect(result.output).toContain("welcome");
    });

    it("processes VTT with HTML tags and Chinese fillers", () => {
      const input = [
        "WEBVTT",
        "",
        "00:00:00.000 --> 00:00:02.500",
        "<i>\u55EF\u6211\u89C9\u5F97\u8FD9\u4E2A\u65B9\u6848\u4E0D\u9519</i>",
      ].join("\n");
      const result = compressor.compress(input, { language: "zh" });
      expect(result.output).not.toContain("WEBVTT");
      expect(result.output).not.toContain("<i>");
      expect(result.output).not.toContain("\u55EF");
      expect(result.output).not.toContain("\u8FD9\u4E2A");
      expect(result.output).toContain("\u65B9\u6848\u4E0D\u9519");
    });

    it("text format with inline timestamps", () => {
      const input = "[00:01] Hello world\n[00:05] Goodbye world";
      const result = compressor.compress(input, {
        removeFillerWords: false,
        format: "text",
      });
      expect(result.output).toContain("Hello world");
      expect(result.output).toContain("Goodbye world");
    });
  });
});
