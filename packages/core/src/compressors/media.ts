import type { CompressResult } from "../types.js";
import { estimateTokens, collapseBlanks } from "../utils/index.js";
import { sanitizePositiveInt, smartTruncateLines as smartTruncate, smartTruncateByTokens } from "./shared.js";

export interface MediaOptions {
  maxLines?: number;
  maxTokens?: number;
  format?: "srt" | "vtt" | "text" | "auto";
  removeTimestamps?: boolean;
  removeSpeakerLabels?: boolean;
  mergeSpeakers?: boolean;
  removeFillerWords?: boolean;
  language?: "en" | "zh" | "auto";
}

type DetectedFormat = "srt" | "vtt" | "text";

interface SpeakerLine {
  speaker: string | null;
  text: string;
}

const SRT_TIMESTAMP_RE = /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/;
const VTT_TIMESTAMP_RE = /\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}/;
const GENERIC_TIMESTAMP_RE =
  /(?:\[?\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\]?\s*(?:-->?\s*\[?\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\]?)?)/;

function detectFormat(content: string): DetectedFormat {
  const firstChunk = content.slice(0, 500);
  if (/^WEBVTT\b/m.test(firstChunk)) return "vtt";

  const lines = content.split("\n").slice(0, 20);
  let hasSequenceNum = false;
  let hasSrtTimestamp = false;
  for (const line of lines) {
    if (/^\d+\s*$/.test(line.trim())) hasSequenceNum = true;
    if (SRT_TIMESTAMP_RE.test(line)) hasSrtTimestamp = true;
  }
  if (hasSrtTimestamp && hasSequenceNum) return "srt";
  if (hasSrtTimestamp) return "srt";

  return "text";
}

// --- HTML tag stripping ---

const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

function stripHtmlTags(text: string): string {
  return text.replace(HTML_TAG_RE, "");
}

// --- Timestamp removal ---

const FULL_TIMESTAMP_LINE_RE =
  /^\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\s*$/;

const INLINE_TIMESTAMP_RE =
  /\[?\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\]?\s*(?:-->\s*\[?\d{1,2}:\d{2}(?::\d{2})?(?:[,.]\d{1,3})?\]?)?\s*/g;

function isTimestampLine(line: string): boolean {
  return FULL_TIMESTAMP_LINE_RE.test(line);
}

function removeInlineTimestamps(line: string): string {
  return line.replace(INLINE_TIMESTAMP_RE, "").trim();
}

// --- Sequence number removal (SRT) ---

function isSrtSequenceNumber(line: string): boolean {
  return /^\s*\d+\s*$/.test(line);
}

// --- Speaker label handling ---

// Matches: "Speaker 1:", "[John]:", "SPEAKER_00:", "Alice:", "Bob Smith:"
// But NOT short words that are just normal text followed by colon
const SPEAKER_LABEL_RE =
  /^\s*(?:\[([^\]]+)\]|(?:SPEAKER[_ ]\d+|Speaker\s+\d+|[A-Z][A-Za-z0-9_ ]+?))\s*:\s*/;

function extractSpeakerAndText(line: string): SpeakerLine {
  const match = SPEAKER_LABEL_RE.exec(line);
  if (match) {
    const speaker = (match[1] ?? match[0].replace(/:\s*$/, "")).trim();
    const text = line.slice(match[0].length).trim();
    return { speaker, text };
  }
  return { speaker: null, text: line };
}

function removeSpeakerLabel(line: string): string {
  return extractSpeakerAndText(line).text;
}

// --- Filler word removal ---

// English filler words/phrases (case-insensitive)
const EN_FILLER_PHRASES = [
  "you know",
  "I mean",
  "sort of",
  "kind of",
];

// English standalone fillers - matched as whole words
const EN_FILLER_WORDS = ["um", "uh", "er", "ah"];

// "like" as filler: ", like," or "like," at start, or ", like" at end
const LIKE_FILLER_RE = /,\s*like\s*,|^like\s*,|,\s*like\s*$/gi;

// Chinese filler words
const ZH_FILLERS = ["就是说", "然后呢", "那个", "这个", "嗯", "啊"];

function removeFillerWordsEn(text: string): string {
  let result = text;

  // Remove filler phrases (case-insensitive, whole-word boundaries)
  for (const phrase of EN_FILLER_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b\\s*,?\\s*`, "gi");
    result = result.replace(re, " ");
  }

  // Remove standalone filler words (whole-word, with optional surrounding comma)
  for (const word of EN_FILLER_WORDS) {
    const re = new RegExp(`(?:,\\s*)?\\b${word}\\b(?:\\s*,)?\\s*`, "gi");
    result = result.replace(re, " ");
  }

  // Remove "like" as filler
  result = result.replace(LIKE_FILLER_RE, " ");

  return result;
}

function removeFillerWordsZh(text: string): string {
  let result = text;
  for (const filler of ZH_FILLERS) {
    // Simple replacement — Chinese fillers don't need word boundaries
    result = result.split(filler).join("");
  }
  return result;
}

function removeFillerWords(text: string, language: "en" | "zh" | "auto"): string {
  if (language === "en") return removeFillerWordsEn(text);
  if (language === "zh") return removeFillerWordsZh(text);
  // "auto" — apply both
  return removeFillerWordsZh(removeFillerWordsEn(text));
}

// --- Duplicate detection ---

function normalizeForDuplicateCheck(text: string): string {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, "");
}

function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeForDuplicateCheck(a);
  const nb = normalizeForDuplicateCheck(b);
  if (na === nb) return true;
  // One is a prefix/subset of the other (common in auto-captions that build up)
  if (na.length > 0 && nb.length > 0) {
    if (nb.startsWith(na) || na.startsWith(nb)) {
      const shorter = Math.min(na.length, nb.length);
      const longer = Math.max(na.length, nb.length);
      // Only consider near-duplicate if the shorter is a significant portion
      if (shorter / longer >= 0.5) return true;
    }
  }
  return false;
}

function removeDuplicateConsecutiveLines(lines: string[]): { lines: string[]; removed: number } {
  if (lines.length === 0) return { lines: [], removed: 0 };
  const result: string[] = [lines[0]];
  let removed = 0;
  let lastNonBlankIdx = lines[0].trim() === "" ? -1 : 0;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      result.push(lines[i]);
      continue;
    }
    const prevText = lastNonBlankIdx >= 0 ? lines[lastNonBlankIdx] : "";
    if (prevText && isNearDuplicate(lines[i], prevText)) {
      const prevResultIdx = result.lastIndexOf(prevText);
      if (prevResultIdx >= 0 && lines[i].length > result[prevResultIdx].length) {
        result[prevResultIdx] = lines[i];
      }
      removed++;
    } else {
      result.push(lines[i]);
    }
    lastNonBlankIdx = i;
  }
  return { lines: result, removed };
}

// --- Normalization helpers ---

function cleanSpaces(text: string): string {
  return text.replace(/\s{2,}/g, " ").trim();
}

export class MediaCompressor {
  compress(content: string, options?: MediaOptions): CompressResult {
    const maxLines = sanitizePositiveInt(options?.maxLines);
    const maxTokens = sanitizePositiveInt(options?.maxTokens);
    const formatOption = options?.format ?? "auto";
    const shouldRemoveTimestamps = options?.removeTimestamps ?? true;
    const shouldRemoveSpeakerLabels = options?.removeSpeakerLabels ?? false;
    const shouldMergeSpeakers = options?.mergeSpeakers ?? true;
    const shouldRemoveFillerWords = options?.removeFillerWords ?? true;
    const language = options?.language ?? "auto";

    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const originalLineCount = normalized.split("\n").length;
    const originalCharCount = content.length;

    // Empty input
    if (normalized.trim() === "") {
      return {
        output: "",
        originalSize: originalLineCount,
        compressedSize: 0,
        ratio: 1,
        format: "air-media",
        metadata: {
          detectedFormat: "text",
          timestampsRemoved: 0,
          fillerWordsRemoved: 0,
          duplicatesRemoved: 0,
          speakersMerged: 0,
        },
      };
    }

    // Detect format
    const detectedFormat: DetectedFormat =
      formatOption === "auto" ? detectFormat(normalized) : formatOption;

    const sourceLines = normalized.split("\n");

    // Track stats
    let timestampsRemoved = 0;
    let fillerWordsRemoved = 0;
    let duplicatesRemoved = 0;
    let speakersMerged = 0;

    // Step 1: Strip WEBVTT header and metadata
    let processedLines = [...sourceLines];
    if (detectedFormat === "vtt") {
      // Remove WEBVTT header line and any metadata lines until first blank
      let headerEnd = 0;
      if (/^WEBVTT\b/.test(processedLines[0]?.trim() ?? "")) {
        headerEnd = 1;
        // Skip metadata lines (key: value) and blank lines after WEBVTT
        while (headerEnd < processedLines.length) {
          const line = processedLines[headerEnd].trim();
          if (line === "") {
            headerEnd++;
            break;
          }
          headerEnd++;
        }
      }
      processedLines = processedLines.slice(headerEnd);
    }

    // Step 2: Remove SRT sequence numbers and timestamp lines
    if (shouldRemoveTimestamps) {
      const filtered: string[] = [];
      for (const line of processedLines) {
        if (isTimestampLine(line)) {
          timestampsRemoved++;
          continue;
        }
        if (detectedFormat === "srt" && isSrtSequenceNumber(line)) {
          timestampsRemoved++;
          continue;
        }
        // For text format, remove inline timestamps
        if (detectedFormat === "text" && GENERIC_TIMESTAMP_RE.test(line)) {
          const cleaned = removeInlineTimestamps(line);
          if (cleaned.length > 0) {
            filtered.push(cleaned);
          }
          if (line !== cleaned) timestampsRemoved++;
          continue;
        }
        filtered.push(line);
      }
      processedLines = filtered;
    }

    // Step 3: Strip HTML tags
    processedLines = processedLines.map(stripHtmlTags);

    // Step 4: Remove filler words
    if (shouldRemoveFillerWords) {
      processedLines = processedLines.map((line) => {
        if (line.trim() === "") return line;
        const cleaned = removeFillerWords(line, language);
        const originalWords = line.split(/\s+/).filter((w) => w.length > 0).length;
        const cleanedWords = cleaned.split(/\s+/).filter((w) => w.length > 0).length;
        const diff = originalWords - cleanedWords;
        if (diff > 0) fillerWordsRemoved += diff;
        return cleaned;
      });
    }

    // Step 5: Clean spaces
    processedLines = processedLines.map(cleanSpaces);

    // Step 6: Remove empty lines from content (but keep paragraph breaks)
    processedLines = processedLines.filter(
      (line, i, arr) => line !== "" || (i > 0 && arr[i - 1] !== "")
    );

    // Step 7: Handle speaker labels
    if (shouldRemoveSpeakerLabels) {
      processedLines = processedLines.map((line) => {
        if (line.trim() === "") return line;
        return removeSpeakerLabel(line);
      });
    }

    // Step 8: Remove duplicate consecutive lines
    const deduped = removeDuplicateConsecutiveLines(processedLines);
    processedLines = deduped.lines;
    duplicatesRemoved = deduped.removed;

    // Step 9: Merge consecutive lines (speaker merging)
    if (shouldMergeSpeakers) {
      const merged: string[] = [];
      let currentSpeaker: string | null | undefined = undefined;
      let currentBlock: string[] = [];

      const flushBlock = (): void => {
        if (currentBlock.length > 0) {
          merged.push(currentBlock.join(" "));
          speakersMerged += currentBlock.length > 1 ? currentBlock.length - 1 : 0;
          currentBlock = [];
        }
      };

      for (const line of processedLines) {
        if (line.trim() === "") {
          flushBlock();
          currentSpeaker = undefined;
          merged.push("");
          continue;
        }

        const { speaker, text } = extractSpeakerAndText(line);
        const effectiveSpeaker = speaker ?? "__no_speaker__";

        if (currentSpeaker === undefined) {
          currentSpeaker = effectiveSpeaker;
          if (shouldRemoveSpeakerLabels) {
            if (text) currentBlock.push(text);
          } else {
            currentBlock.push(line);
          }
        } else if (effectiveSpeaker === currentSpeaker) {
          if (shouldRemoveSpeakerLabels) {
            if (text) currentBlock.push(text);
          } else {
            currentBlock.push(text || line);
          }
        } else {
          flushBlock();
          currentSpeaker = effectiveSpeaker;
          if (shouldRemoveSpeakerLabels) {
            if (text) currentBlock.push(text);
          } else {
            currentBlock.push(line);
          }
        }
      }
      flushBlock();
      processedLines = merged;
    }

    // Step 10: Clean spaces again and collapse blanks
    processedLines = processedLines.map(cleanSpaces);
    processedLines = collapseBlanks(processedLines);

    // Trim leading/trailing blank lines
    while (processedLines.length > 0 && processedLines[0] === "") {
      processedLines.shift();
    }
    while (processedLines.length > 0 && processedLines[processedLines.length - 1] === "") {
      processedLines.pop();
    }

    // Remove any remaining empty-only entries
    processedLines = processedLines.filter(
      (line, i, arr) => line !== "" || (i > 0 && i < arr.length - 1 && arr[i - 1] !== "" && arr[i + 1] !== "")
    );

    // Re-collapse after filtering
    processedLines = collapseBlanks(processedLines);
    while (processedLines.length > 0 && processedLines[processedLines.length - 1] === "") {
      processedLines.pop();
    }
    while (processedLines.length > 0 && processedLines[0] === "") {
      processedLines.shift();
    }

    // Step 11: Apply maxLines / maxTokens truncation
    let budgetExceeded = false;
    let includeStats = true;
    const footerEstimatedLines = 1;
    const footerEstimatedTokens = 25;

    if (maxLines !== undefined && maxLines <= footerEstimatedLines) {
      includeStats = false;
    }
    if (maxTokens !== undefined && maxTokens <= footerEstimatedTokens) {
      includeStats = false;
    }

    const effectiveMaxLines =
      maxLines !== undefined
        ? Math.max(1, maxLines - (includeStats ? footerEstimatedLines : 0))
        : undefined;
    const effectiveMaxTokens =
      maxTokens !== undefined
        ? Math.max(1, maxTokens - (includeStats ? footerEstimatedTokens : 0))
        : undefined;

    if (effectiveMaxLines !== undefined && processedLines.length > effectiveMaxLines) {
      processedLines = smartTruncate(processedLines, effectiveMaxLines);
    }
    if (effectiveMaxTokens !== undefined) {
      const truncResult = smartTruncateByTokens(processedLines, effectiveMaxTokens);
      processedLines = truncResult.lines;
      budgetExceeded = truncResult.budgetExceeded;
    }

    const compressedContent = processedLines.join("\n");
    const compressedLineCount = processedLines.length;

    const rawSavedPercent =
      originalLineCount > 0
        ? Math.round((1 - compressedLineCount / originalLineCount) * 100)
        : 0;
    const savedPercent = Math.max(0, rawSavedPercent);

    const statsLine = `--- air: ${originalLineCount} lines \u2192 ${compressedLineCount} lines (${savedPercent}% saved) ---`;
    const output = includeStats ? compressedContent + "\n" + statsLine : compressedContent;

    return {
      output,
      originalSize: originalLineCount,
      compressedSize: compressedLineCount,
      ratio: originalLineCount > 0 ? compressedLineCount / originalLineCount : 1,
      format: "air-media",
      metadata: {
        detectedFormat,
        timestampsRemoved,
        fillerWordsRemoved,
        duplicatesRemoved,
        speakersMerged,
        originalLines: originalLineCount,
        compressedLines: compressedLineCount,
        savedPercent,
        budgetExceeded,
        statsIncluded: includeStats,
      },
    };
  }
}
