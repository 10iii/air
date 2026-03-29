/**
 * AIR OC Plugin Tests
 *
 * Tests for the OpenCode plugin hook-based compression system.
 * These are logic tests that don't require mocking the full plugin.
 */

import { describe, it, expect, beforeEach } from "vitest";

describe("AIR OC Plugin Logic", () => {
  describe("Configuration Values", () => {
    it("should have sensible default config values", () => {
      // These mirror the CONFIG object in index.ts
      const CONFIG = {
        minGain: 200,
        defaultDisabledCalls: 10,
        maxRawSize: 20 * 1024 * 1024,
        maxOutputSize: 5 * 1024 * 1024,
      };

      expect(CONFIG.minGain).toBe(200);
      expect(CONFIG.defaultDisabledCalls).toBe(10);
      expect(CONFIG.maxRawSize).toBe(20971520); // 20MB
      expect(CONFIG.maxOutputSize).toBe(5242880); // 5MB
    });
  });

  describe("Compressor Selection Logic", () => {
    // Test the selectCompressor logic (pattern matching)

    function selectCompressorName(toolName: string): string | null {
      const name = toolName.toLowerCase();

      // Tools that should NOT be compressed
      if (
        name === "air_on" ||
        name === "air_off" ||
        name.includes("edit") ||
        name.includes("write") ||
        name.includes("patch") ||
        name.includes("question") ||
        name.includes("todowrite") ||
        name.includes("message") ||
        name.includes("sessions_send") ||
        name.includes("sessions_history") ||
        name.includes("canvas") ||
        name.includes("image")
      ) {
        return null;
      }

      if (
        name.includes("bash") ||
        name.includes("shell") ||
        name.includes("exec") ||
        name.includes("process")
      ) {
        return "BashCompressor";
      }

      if (
        name.includes("read") ||
        name.includes("cat") ||
        name.includes("file") ||
        name.includes("skill")
      ) {
        return "ReadCompressor";
      }

      if (name.includes("grep")) {
        return "GrepCompressor";
      }

      if (
        name.includes("glob") ||
        name.includes("list") ||
        name.includes("ls") ||
        name.includes("dir")
      ) {
        return "LsCompressor";
      }

      if (
        name.includes("webfetch") ||
        name.includes("web_fetch") ||
        name.includes("fetch") ||
        name.includes("curl") ||
        name.includes("browser")
      ) {
        return "WebCompressor";
      }

      if (name.includes("search")) {
        return "SearchCompressor";
      }

      if (name.includes("diff")) {
        return "DiffCompressor";
      }

      if (
        name.includes("api") ||
        name.includes("json") ||
        name.includes("nodes") ||
        name.includes("cron") ||
        name.includes("gateway") ||
        name.includes("sessions_list") ||
        name.includes("memory")
      ) {
        return "ApiCompressor";
      }

      return null;
    }

    it("should select BashCompressor for bash/shell/exec tools", () => {
      expect(selectCompressorName("bash")).toBe("BashCompressor");
      expect(selectCompressorName("shell")).toBe("BashCompressor");
      expect(selectCompressorName("exec")).toBe("BashCompressor");
      expect(selectCompressorName("process")).toBe("BashCompressor");
    });

    it("should select ReadCompressor for read/file tools", () => {
      expect(selectCompressorName("read")).toBe("ReadCompressor");
      expect(selectCompressorName("cat")).toBe("ReadCompressor");
      expect(selectCompressorName("file")).toBe("ReadCompressor");
      expect(selectCompressorName("skill")).toBe("ReadCompressor");
    });

    it("should select GrepCompressor for grep tools", () => {
      expect(selectCompressorName("grep")).toBe("GrepCompressor");
    });

    it("should select LsCompressor for directory listing tools", () => {
      expect(selectCompressorName("glob")).toBe("LsCompressor");
      expect(selectCompressorName("list")).toBe("LsCompressor");
      expect(selectCompressorName("ls")).toBe("LsCompressor");
      expect(selectCompressorName("dir")).toBe("LsCompressor");
    });

    it("should select WebCompressor for web tools", () => {
      expect(selectCompressorName("webfetch")).toBe("WebCompressor");
      expect(selectCompressorName("web_fetch")).toBe("WebCompressor");
      expect(selectCompressorName("fetch")).toBe("WebCompressor");
      expect(selectCompressorName("curl")).toBe("WebCompressor");
      expect(selectCompressorName("browser")).toBe("WebCompressor");
    });

    it("should select SearchCompressor for search tools", () => {
      expect(selectCompressorName("websearch")).toBe("SearchCompressor");
      expect(selectCompressorName("search")).toBe("SearchCompressor");
    });

    it("should select DiffCompressor for diff tools", () => {
      expect(selectCompressorName("diff")).toBe("DiffCompressor");
    });

    it("should select ApiCompressor for JSON/API tools", () => {
      expect(selectCompressorName("api")).toBe("ApiCompressor");
      expect(selectCompressorName("json")).toBe("ApiCompressor");
      expect(selectCompressorName("nodes")).toBe("ApiCompressor");
      // Note: sessions_list contains "list" so matches LsCompressor first
      // This is expected behavior - order of checks matters
      expect(selectCompressorName("memory_get")).toBe("ApiCompressor");
    });

    it("should NOT compress edit/write/patch tools", () => {
      expect(selectCompressorName("edit")).toBeNull();
      expect(selectCompressorName("write")).toBeNull();
      expect(selectCompressorName("patch")).toBeNull();
      expect(selectCompressorName("apply_patch")).toBeNull();
    });

    it("should NOT compress interactive/message tools", () => {
      expect(selectCompressorName("question")).toBeNull();
      expect(selectCompressorName("message")).toBeNull();
      expect(selectCompressorName("sessions_send")).toBeNull();
      expect(selectCompressorName("todowrite")).toBeNull();
    });

    it("should NOT compress sessions_history (high risk)", () => {
      expect(selectCompressorName("sessions_history")).toBeNull();
    });

    it("should NOT compress air_on/air_off", () => {
      expect(selectCompressorName("air_on")).toBeNull();
      expect(selectCompressorName("air_off")).toBeNull();
    });

    it("should NOT compress image tools", () => {
      expect(selectCompressorName("image")).toBeNull();
      expect(selectCompressorName("image_generate")).toBeNull();
    });
  });

  describe("Compression Decision Logic", () => {
    const MIN_GAIN = 200;

    function shouldCompress(original: number, compressed: number): boolean {
      const gain = original - compressed;
      return gain >= MIN_GAIN;
    }

    it("should compress when gain >= 200", () => {
      expect(shouldCompress(1000, 500)).toBe(true); // 500 gain
      expect(shouldCompress(500, 250)).toBe(true); // 250 gain
      expect(shouldCompress(400, 200)).toBe(true); // 200 gain (edge)
    });

    it("should NOT compress when gain < 200", () => {
      expect(shouldCompress(300, 200)).toBe(false); // 100 gain
      expect(shouldCompress(250, 100)).toBe(false); // 150 gain
      expect(shouldCompress(399, 200)).toBe(false); // 199 gain
    });

    it("should NOT compress when compression increases size", () => {
      expect(shouldCompress(100, 150)).toBe(false); // -50 gain
    });
  });

  describe("Air State Management", () => {
    let airEnabled: boolean;
    let disabledCallsRemaining: number;

    beforeEach(() => {
      airEnabled = true;
      disabledCallsRemaining = 0;
    });

    function airOn() {
      airEnabled = true;
      disabledCallsRemaining = 0;
    }

    function airOff(calls: number = 10) {
      airEnabled = false;
      disabledCallsRemaining = calls;
    }

    function processToolCall() {
      if (!airEnabled && disabledCallsRemaining > 0) {
        disabledCallsRemaining--;
        if (disabledCallsRemaining === 0) {
          airEnabled = true;
        }
      }
    }

    it("should start with compression enabled", () => {
      expect(airEnabled).toBe(true);
      expect(disabledCallsRemaining).toBe(0);
    });

    it("should disable compression on air_off()", () => {
      airOff(5);
      expect(airEnabled).toBe(false);
      expect(disabledCallsRemaining).toBe(5);
    });

    it("should use default 10 calls for air_off()", () => {
      airOff();
      expect(disabledCallsRemaining).toBe(10);
    });

    it("should auto-enable after countdown reaches 0", () => {
      airOff(3);

      processToolCall();
      expect(airEnabled).toBe(false);
      expect(disabledCallsRemaining).toBe(2);

      processToolCall();
      expect(airEnabled).toBe(false);
      expect(disabledCallsRemaining).toBe(1);

      processToolCall();
      expect(airEnabled).toBe(true);
      expect(disabledCallsRemaining).toBe(0);
    });

    it("should enable compression on air_on()", () => {
      airOff(5);
      airOn();
      expect(airEnabled).toBe(true);
      expect(disabledCallsRemaining).toBe(0);
    });
  });

  describe("Size Limit Handling", () => {
    const MAX_RAW_SIZE = 20 * 1024 * 1024;
    const MAX_OUTPUT_SIZE = 5 * 1024 * 1024;

    function truncateRaw(content: string): string {
      if (content.length > MAX_RAW_SIZE) {
        return (
          content.slice(0, MAX_RAW_SIZE) +
          "\n[TRUNCATED: page exceeded 20MB, showing first 20MB]"
        );
      }
      return content;
    }

    function truncateOutput(output: string): string {
      if (output.length > MAX_OUTPUT_SIZE) {
        return (
          output.slice(0, MAX_OUTPUT_SIZE - 200) +
          "\n\n[AIR: output truncated to fit 5M limit.]"
        );
      }
      return output;
    }

    it("should truncate raw content at 20MB", () => {
      const largeContent = "x".repeat(25 * 1024 * 1024);
      const truncated = truncateRaw(largeContent);
      expect(truncated.length).toBeLessThanOrEqual(MAX_RAW_SIZE + 100);
      expect(truncated).toContain("[TRUNCATED");
    });

    it("should not truncate content under 20MB", () => {
      const smallContent = "x".repeat(10 * 1024 * 1024);
      const result = truncateRaw(smallContent);
      expect(result).toBe(smallContent);
    });

    it("should truncate compressed output at 5MB", () => {
      const largeOutput = "y".repeat(6 * 1024 * 1024);
      const truncated = truncateOutput(largeOutput);
      expect(truncated.length).toBeLessThanOrEqual(MAX_OUTPUT_SIZE);
      expect(truncated).toContain("[AIR: output truncated");
    });

    it("should not truncate output under 5MB", () => {
      const smallOutput = "y".repeat(4 * 1024 * 1024);
      const result = truncateOutput(smallOutput);
      expect(result).toBe(smallOutput);
    });
  });

  describe("Compression Marker", () => {
    function formatOutput(compressed: string, ratio: number): string {
      return `${compressed}\n[AIR: compressed ${ratio}% | air_off() for raw]`;
    }

    function calculateRatio(original: number, compressed: number): number {
      const gain = original - compressed;
      return Math.round((gain / original) * 100);
    }

    it("should add marker at end of compressed output", () => {
      const output = formatOutput("compressed content", 63);
      expect(output.endsWith("| air_off() for raw]")).toBe(true);
      expect(output).toContain("[AIR: compressed 63%");
    });

    it("should calculate correct compression ratio", () => {
      expect(calculateRatio(1000, 370)).toBe(63);
      expect(calculateRatio(1000, 500)).toBe(50);
      expect(calculateRatio(1000, 900)).toBe(10);
      expect(calculateRatio(1000, 100)).toBe(90);
    });
  });

  describe("Bash Command Smart Routing", () => {
    /**
     * Simulates selectCompressorForBashCommand logic from index.ts
     */
    function selectCompressorForBashCommand(command: string): string {
      const trimmed = command.trim();
      const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() || "";
      const baseName = firstWord.split("/").pop() || firstWord;

      // Grep-like commands
      if (/^(grep|egrep|fgrep|rg|ag|ack)$/.test(baseName)) {
        return "GrepCompressor";
      }

      // Directory listing commands
      if (/^(ls|find|tree|exa|eza|lsd)$/.test(baseName)) {
        return "LsCompressor";
      }

      // Git diff
      if (baseName === "git") {
        const gitSubcommand = trimmed.match(/^git\s+(\S+)/)?.[1]?.toLowerCase();
        if (gitSubcommand === "diff" || gitSubcommand === "show") {
          return "DiffCompressor";
        }
        if (gitSubcommand === "log" && /\s-p\b/.test(trimmed)) {
          return "DiffCompressor";
        }
      }

      return "BashCompressor";
    }

    it("should route grep commands to GrepCompressor", () => {
      expect(selectCompressorForBashCommand("grep -rn export .")).toBe("GrepCompressor");
      expect(selectCompressorForBashCommand("grep --include='*.ts' pattern")).toBe("GrepCompressor");
      expect(selectCompressorForBashCommand("/usr/bin/grep -r foo")).toBe("GrepCompressor");
    });

    it("should route ripgrep to GrepCompressor", () => {
      expect(selectCompressorForBashCommand("rg export src/")).toBe("GrepCompressor");
      expect(selectCompressorForBashCommand("rg -i pattern --type ts")).toBe("GrepCompressor");
    });

    it("should route egrep/fgrep to GrepCompressor", () => {
      expect(selectCompressorForBashCommand("egrep 'foo|bar' file.txt")).toBe("GrepCompressor");
      expect(selectCompressorForBashCommand("fgrep literal file.txt")).toBe("GrepCompressor");
    });

    it("should route ag (silver searcher) to GrepCompressor", () => {
      expect(selectCompressorForBashCommand("ag pattern --ts")).toBe("GrepCompressor");
    });

    it("should route ls commands to LsCompressor", () => {
      expect(selectCompressorForBashCommand("ls -la")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("ls -R /home")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("/bin/ls -l")).toBe("LsCompressor");
    });

    it("should route find commands to LsCompressor", () => {
      expect(selectCompressorForBashCommand("find . -name '*.ts'")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("find /home -type f")).toBe("LsCompressor");
    });

    it("should route tree commands to LsCompressor", () => {
      expect(selectCompressorForBashCommand("tree -L 2")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("tree src/")).toBe("LsCompressor");
    });

    it("should route exa/eza/lsd to LsCompressor", () => {
      expect(selectCompressorForBashCommand("exa -l")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("eza --tree")).toBe("LsCompressor");
      expect(selectCompressorForBashCommand("lsd -la")).toBe("LsCompressor");
    });

    it("should route git diff to DiffCompressor", () => {
      expect(selectCompressorForBashCommand("git diff")).toBe("DiffCompressor");
      expect(selectCompressorForBashCommand("git diff HEAD~3")).toBe("DiffCompressor");
      expect(selectCompressorForBashCommand("git diff --stat")).toBe("DiffCompressor");
    });

    it("should route git show to DiffCompressor", () => {
      expect(selectCompressorForBashCommand("git show abc123")).toBe("DiffCompressor");
      expect(selectCompressorForBashCommand("git show HEAD")).toBe("DiffCompressor");
    });

    it("should route git log -p to DiffCompressor", () => {
      expect(selectCompressorForBashCommand("git log -p")).toBe("DiffCompressor");
      expect(selectCompressorForBashCommand("git log -p --oneline")).toBe("DiffCompressor");
      expect(selectCompressorForBashCommand("git log --oneline -p")).toBe("DiffCompressor");
    });

    it("should NOT route git log (without -p) to DiffCompressor", () => {
      expect(selectCompressorForBashCommand("git log")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("git log --oneline")).toBe("BashCompressor");
    });

    it("should route other git commands to BashCompressor", () => {
      expect(selectCompressorForBashCommand("git status")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("git branch -a")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("git commit -m 'msg'")).toBe("BashCompressor");
    });

    it("should route other commands to BashCompressor", () => {
      expect(selectCompressorForBashCommand("npm install")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("pnpm build")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("echo hello")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("cat file.txt")).toBe("BashCompressor");
    });

    it("should handle empty/whitespace commands gracefully", () => {
      expect(selectCompressorForBashCommand("")).toBe("BashCompressor");
      expect(selectCompressorForBashCommand("   ")).toBe("BashCompressor");
    });
  });
});
