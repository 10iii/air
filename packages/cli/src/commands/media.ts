import { Command } from "commander";
import { MediaCompressor } from "@10iii/air-core";
import { readFileSync } from "node:fs";
import { strictParseInt, requirePositiveInteger } from "../utils.js";

function parseFormat(value: string): string {
  const valid = ["srt", "vtt", "text", "auto"];
  if (!valid.includes(value)) {
    process.stderr.write(`Error: --format must be one of: ${valid.join(", ")}\n`);
    process.exit(1);
  }
  return value;
}

function parseLanguage(value: string): string {
  const valid = ["en", "zh", "auto"];
  if (!valid.includes(value)) {
    process.stderr.write(`Error: --language must be one of: ${valid.join(", ")}\n`);
    process.exit(1);
  }
  return value;
}

export const mediaCommand = new Command("media")
  .description("Compress media transcripts (SRT/VTT/text subtitles)")
  .option("--max-lines <n>", "Maximum output lines", strictParseInt)
  .option("--max-tokens <n>", "Maximum output tokens (approximate)", strictParseInt)
  .option("--format <type>", "Input format (srt, vtt, text, auto)", parseFormat)
  .option("--remove-timestamps", "Remove timestamps from output")
  .option("--remove-speaker-labels", "Remove speaker labels from output")
  .option("--merge-speakers", "Merge consecutive lines from same speaker")
  .option("--remove-filler-words", "Remove filler words (um, uh, etc.)")
  .option("--language <lang>", "Language for filler word detection (en, zh, auto)", parseLanguage)
  .action(
    (options: {
      maxLines?: number;
      maxTokens?: number;
      format?: string;
      removeTimestamps?: boolean;
      removeSpeakerLabels?: boolean;
      mergeSpeakers?: boolean;
      removeFillerWords?: boolean;
      language?: string;
    }) => {
      const maxLines = requirePositiveInteger("max-lines", options.maxLines);
      const maxTokens = requirePositiveInteger("max-tokens", options.maxTokens);
      const content = readFileSync(0, "utf-8");

      const compressor = new MediaCompressor();
      const result = compressor.compress(content, {
        maxLines,
        maxTokens,
        format: options.format,
        removeTimestamps: options.removeTimestamps,
        removeSpeakerLabels: options.removeSpeakerLabels,
        mergeSpeakers: options.mergeSpeakers,
        removeFillerWords: options.removeFillerWords,
        language: options.language,
      });

      process.stdout.write(result.output + "\n");
    }
  );
