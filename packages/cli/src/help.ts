/**
 * LLM-first help system for AIR CLI
 *
 * Design principles:
 * 1. Examples first, not flags
 * 2. Direct call preferred, pipe as alternative
 * 3. Short, token-efficient
 * 4. On error, show full help (LLM can't read docs)
 */

// Command help definitions with examples and full descriptions
export interface CommandHelp {
  name: string;
  brief: string;          // One-line description for air --help
  example: string;        // Primary example (direct call)
  pipeExample?: string;   // Secondary example (pipe mode)
  fullHelp: string;       // Complete help for air <cmd> --help
}

export const COMMAND_HELP: Record<string, CommandHelp> = {
  bash: {
    name: "bash",
    brief: "Compress terminal output",
    example: "air bash ls -la",
    pipeExample: "ls -la | air bash",
    fullHelp: `air bash - Compress terminal/command output

USAGE:
  air bash <command>           Execute command, compress output
  <command> | air bash         Compress piped output

EXAMPLES:
  air bash npm install         Run npm install, compress output
  air bash -- ls -la           Use -- for commands with flags
  npm test 2>&1 | air bash     Pipe existing output

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --no-strip-ansi        Keep ANSI color codes
  --no-collapse-blanks   Keep consecutive blank lines
  --no-collapse-repeats  Keep repeated lines (e.g., progress bars)
  --no-filter-noise      Keep noise patterns (timestamps, progress)

OUTPUT:
  Compressed command output with:
  - ANSI codes stripped (configurable)
  - Blank lines collapsed
  - Repeated lines merged (shows count)
  - Noise patterns filtered`,
  },

  web: {
    name: "web",
    brief: "Extract article from URL",
    example: "air web https://example.com/article",
    pipeExample: "curl -s URL | air web",
    fullHelp: `air web - Extract and compress article content from HTML

USAGE:
  air web <url>                Fetch URL, extract article
  curl URL | air web           Extract from piped HTML

EXAMPLES:
  air web https://example.com/blog/post
  air web https://docs.python.org/3/tutorial --code-only
  curl -s https://example.com | air web --format text

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --format <type>        Output format: markdown (default) | text
  --code-only            Extract only code blocks from page
  --score                Include content density score
  --dom-snapshot         Optimize for browser automation snapshots

OUTPUT:
  Clean article text in markdown format with:
  - Boilerplate removed (nav, footer, ads)
  - Code blocks preserved
  - Links converted to markdown`,
  },

  api: {
    name: "api",
    brief: "Compress JSON/API response",
    example: "air api https://api.example.com/data",
    pipeExample: "curl -s API_URL | air api",
    fullHelp: `air api - Fetch and compress API/JSON response

USAGE:
  air api <url>                Fetch JSON from URL, compress
  curl URL | air api           Compress piped JSON

EXAMPLES:
  air api https://api.github.com/users/octocat
  air api https://api.example.com/items --max-array-length 3
  curl -s https://api.example.com/data | air api --remove-nulls

OPTIONS:
  --max-lines <n>            Limit output lines
  --max-tokens <n>           Limit output tokens (approximate)
  --max-depth <n>            Maximum JSON nesting depth
  --max-array-length <n>     Truncate arrays to N elements
  --remove-nulls             Remove null values
  --remove-defaults          Remove default values (0, "", false, [])
  --schema-fields <fields>   Keep only these fields (comma-separated)

OUTPUT:
  Compressed JSON with:
  - Deep objects truncated
  - Large arrays sampled
  - Null/default values optionally removed`,
  },

  search: {
    name: "search",
    brief: "Search web and compress results",
    example: 'air search "python async tutorial"',
    pipeExample: "cat results.json | air search",
    fullHelp: `air search - Search the web and compress results

USAGE:
  air search "query"           Search web, compress results
  cat results.json | air search  Compress existing results

EXAMPLES:
  air search "how to parse json in python"
  air search "rust ownership" --max-results 5

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --max-results <n>      Maximum search results (default: 10)

OUTPUT:
  Ranked search results with:
  - Title, URL, snippet for each result
  - Deduplicated across search engines
  - Relevance-sorted`,
  },

  read: {
    name: "read",
    brief: "Compress file content",
    example: "air read src/index.ts",
    fullHelp: `air read - Compress file content for AI consumption

USAGE:
  air read <file>              Read and compress file
  air read - < file.txt        Read from stdin

EXAMPLES:
  air read src/index.ts
  air read main.py --mode skeleton
  air read data.json --max-lines 100

OPTIONS:
  --max-lines <n>            Limit output lines
  --max-tokens <n>           Limit output tokens (approximate)
  --line-numbers             Include line number prefixes
  --mode <mode>              full (default) | skeleton (signatures only)
  --use-tree-sitter          Use tree-sitter for skeleton (better accuracy)
  --no-collapse-comments     Keep full comment blocks
  --no-collapse-imports      Keep all import lines
  --no-collapse-blanks       Keep consecutive blank lines

OUTPUT:
  Compressed source code with:
  - Import blocks collapsed
  - Comment blocks summarized
  - Blank lines merged
  - Skeleton mode: only function/class signatures`,
  },

  grep: {
    name: "grep",
    brief: "Search files and compress matches",
    example: 'air grep "TODO" src/',
    pipeExample: 'rg "pattern" | air grep',
    fullHelp: `air grep - Search files and compress grep output

USAGE:
  air grep "pattern" [path]    Search with rg/grep, compress
  rg "pattern" | air grep      Compress piped grep output

EXAMPLES:
  air grep "TODO" src/
  air grep "function" --files-only
  rg -n "error" | air grep --max-files 10

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --max-files <n>        Maximum files to show
  --merge-distance <n>   Merge matches within N lines
  --files-only           Show only filenames with match counts

OUTPUT:
  Compressed grep results with:
  - Files grouped together
  - Nearby matches merged
  - Match context preserved`,
  },

  test: {
    name: "test",
    brief: "Run tests and compress output",
    example: "air test npm test",
    pipeExample: "npm test | air test",
    fullHelp: `air test - Run tests and compress output

USAGE:
  air test <command>           Run test command, compress output
  npm test | air test          Compress piped test output

EXAMPLES:
  air test npm test
  air test pytest -v
  air test -- jest --coverage
  npm test 2>&1 | air test --runner jest

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --runner <name>        Force test runner: pytest|jest|vitest|go|cargo
                         (auto-detected from command if not specified)

OUTPUT:
  Compressed test results with:
  - Summary stats (passed/failed/skipped)
  - Failed test details preserved
  - Stack traces compressed
  - Passing tests summarized`,
  },

  ls: {
    name: "ls",
    brief: "Compress directory listing",
    example: "air ls src/",
    pipeExample: "ls -la | air ls",
    fullHelp: `air ls - Compress directory listing

USAGE:
  air ls [path]                List directory, compress output
  ls -la | air ls              Compress piped listing

EXAMPLES:
  air ls
  air ls src/ --max-depth 2
  ls -laR | air ls --group-by-type

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --max-depth <n>        Maximum directory depth
  --group-by-type        Group files by extension

OUTPUT:
  Compressed directory listing with:
  - Deep directories truncated
  - Files grouped by type (optional)
  - Size/date info preserved`,
  },

  diff: {
    name: "diff",
    brief: "Compress git diff output",
    example: "air diff HEAD~3",
    pipeExample: "git diff | air diff",
    fullHelp: `air diff - Compress git diff output

USAGE:
  air diff [ref]               Run git diff, compress output
  git diff | air diff          Compress piped diff

EXAMPLES:
  air diff                     # unstaged changes
  air diff HEAD~3              # last 3 commits
  air diff main                # diff against main
  git diff --cached | air diff --level summary

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --level <level>        Detail level:
                           summary  - files changed + stats only
                           compact  - key changes (default)
                           full     - complete diff

OUTPUT:
  Compressed diff with:
  - File list and change stats
  - Large diffs summarized
  - Context preserved for key changes`,
  },

  edit: {
    name: "edit",
    brief: "Apply search/replace edits",
    example: 'air edit file.ts -s "old" -r "new"',
    pipeExample: 'echo \'{"content":"...","edits":[...]}\' | air edit',
    fullHelp: `air edit - Apply search/replace edits with compression

USAGE:
  air edit <file> -s "old" -r "new"    Edit file directly
  echo '{"content":"...","edits":[...]}' | air edit  Batch edits from JSON

EXAMPLES:
  air edit src/index.ts -s "foo" -r "bar"
  air edit main.py -s "print" -r "logger.info" --dry-run

OPTIONS:
  -s, --search <text>       Text to search for (required with file)
  -r, --replace <text>      Text to replace with (required with file)
  --max-lines <n>           Limit output lines
  --max-tokens <n>          Limit output tokens (approximate)
  --dry-run                 Preview changes without applying
  --fuzzy-threshold <n>     Fuzzy match threshold 0-1 (default: exact)
  --no-fuzzy                Disable fuzzy matching
  --line-ending <mode>      auto|preserve|lf

JSON INPUT FORMAT (for pipe mode):
  {"content": "file content", "edits": [{"search": "old", "replace": "new"}]}

OUTPUT:
  Edit result showing:
  - Before/after context
  - Line numbers affected
  - Match status`,
  },

  session: {
    name: "session",
    brief: "Compress AI chat session",
    example: "air session chat.json",
    pipeExample: "cat session.json | air session",
    fullHelp: `air session - Compress AI chat session data

USAGE:
  air session <file>           Compress session file
  cat session.json | air session  Compress piped session

EXAMPLES:
  air session conversation.json
  air session chat.json --max-messages 50 --strategy tool-focused

OPTIONS:
  --max-lines <n>        Limit output lines
  --max-tokens <n>       Limit output tokens (approximate)
  --max-messages <n>     Maximum messages to include
  --strategy <type>      Compression strategy:
                           time-decay   - prioritize recent messages
                           tool-focused - prioritize tool calls/results
                           balanced     - mix of both

OUTPUT:
  Compressed session with:
  - Old messages summarized
  - Tool calls preserved
  - Recent context retained`,
  },

  media: {
    name: "media",
    brief: "Compress media transcripts",
    example: "air media transcript.srt",
    pipeExample: "cat subtitles.vtt | air media",
    fullHelp: `air media - Compress media transcripts (SRT/VTT/text)

USAGE:
  air media <file>             Compress transcript file
  cat transcript.srt | air media  Compress piped transcript

EXAMPLES:
  air media video.srt
  air media interview.vtt --remove-timestamps
  air media podcast.txt --remove-filler-words --language en

OPTIONS:
  --max-lines <n>            Limit output lines
  --max-tokens <n>           Limit output tokens (approximate)
  --format <type>            Input format: srt|vtt|text|auto (auto-detected)
  --remove-timestamps        Remove timestamp markers
  --remove-speaker-labels    Remove speaker labels (Speaker 1:, etc.)
  --merge-speakers           Merge consecutive lines from same speaker
  --remove-filler-words      Remove um, uh, like, etc.
  --language <lang>          Language for filler detection: en|zh|auto

OUTPUT:
  Clean transcript with:
  - Timestamps optionally removed
  - Speakers optionally merged
  - Filler words removed`,
  },

  init: {
    name: "init",
    brief: "Inject AIR guide into AI agent configs",
    example: "air init",
    fullHelp: `air init - Inject AIR usage guide into AI agent configuration files

USAGE:
  air init                   Scan and inject AIR guide
  air init --dry-run         Show what would be done

WHAT IT DOES:
  1. Scans current directory for: AGENTS.md, CLAUDE.md, GEMINI.md
  2. Creates/updates global configs:
     - ~/.claude/CLAUDE.md
     - ~/.codex/AGENTS.md
     - ~/.config/agents/AGENTS.md
  3. Appends AIR usage guide (if not already present)

OPTIONS:
  -n, --dry-run    Preview changes without writing
  -q, --quiet      Suppress output

AUTO-TRIGGER:
  Also runs silently on: air --version, air --help`,
  },
};

/**
 * Generate the main air --help output (LLM-first format)
 */
export function generateMainHelp(): string {
  const lines: string[] = [
    "air - AI-optimized tool output compression",
    "",
    "COMMANDS:",
  ];

  for (const cmd of Object.values(COMMAND_HELP)) {
    const paddedName = cmd.name.padEnd(10);
    lines.push(`  ${paddedName} ${cmd.brief}`);
    lines.push(`             ${cmd.example}`);
    if (cmd.pipeExample) {
      lines.push(`             ${cmd.pipeExample}`);
    }
  }

  lines.push("");
  lines.push("OPTIONS:");
  lines.push("  -v, --version    Show version");
  lines.push("  -h, --help       Show this help");
  lines.push("");
  lines.push("Run 'air <command> --help' for detailed usage.");

  return lines.join("\n");
}

/**
 * Show full help for a command and exit
 */
export function showHelpAndExit(cmdName: string, error?: string): never {
  const help = COMMAND_HELP[cmdName];
  if (!help) {
    process.stderr.write(`Unknown command: ${cmdName}\n`);
    process.exit(1);
  }

  if (error) {
    process.stderr.write(`Error: ${error}\n\n`);
  }
  process.stdout.write(help.fullHelp + "\n");
  process.exit(error ? 1 : 0);
}

/**
 * Create an error handler that shows full help on unknown options
 */
export function createErrorHandler(cmdName: string) {
  return (error: Error) => {
    const msg = error.message;
    // Unknown option, missing argument, etc. - show full help
    if (
      msg.includes("unknown option") ||
      msg.includes("missing required") ||
      msg.includes("Invalid") ||
      msg.includes("Error:")
    ) {
      showHelpAndExit(cmdName, msg);
    }
    throw error;
  };
}
