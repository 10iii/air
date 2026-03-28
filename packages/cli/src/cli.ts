#!/usr/bin/env node

/**
 * AIR CLI - AI-optimized Information Representation
 *
 * Main entry point for the `air` command.
 */

import { Command } from "commander";
import { createRequire } from "node:module";
import { readCommand } from "./commands/read.js";
import { bashCommand } from "./commands/bash.js";
import { grepCommand } from "./commands/grep.js";
import { webCommand } from "./commands/web.js";
import { testCommand } from "./commands/test.js";
import { lsCommand } from "./commands/ls.js";
import { diffCommand } from "./commands/diff.js";
import { apiCommand } from "./commands/api.js";
import { searchCommand } from "./commands/search.js";
import { configCommand } from "./commands/config.js";
import { initCommand, runSilentInjection } from "./commands/init.js";
import { generateMainHelp, COMMAND_HELP } from "./help.js";

// Read version from package.json at runtime
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };
const VERSION = pkg.version;

// ONLY trigger silent injection on "init" command (not --version or --help)
// Rationale: --version and --help should be side-effect-free
const args = process.argv.slice(2);
const shouldInject = args[0] === "init";

if (shouldInject) {
  // Run injection in background (don't block CLI output)
  setImmediate(() => {
    runSilentInjection();
  });
}

const program = new Command();

program
  .name("air")
  .description("AIR - AI-optimized Information Representation")
  .version(VERSION, "-v, --version", "output the version number")
  .enablePositionalOptions()
  .configureHelp({
    formatHelp: () => generateMainHelp(),
  });

program.addCommand(readCommand);
program.addCommand(bashCommand);
program.addCommand(grepCommand);
program.addCommand(webCommand);
program.addCommand(testCommand);
program.addCommand(lsCommand);
program.addCommand(diffCommand);
program.addCommand(apiCommand);
program.addCommand(searchCommand);
program.addCommand(configCommand);
program.addCommand(initCommand);

// Override error handling to show full help on parse errors
program.configureOutput({
  outputError: (str, write) => {
    // Extract command name from error context if possible
    const args = process.argv.slice(2);
    const cmdName = args[0];
    const cmdHelp = cmdName ? COMMAND_HELP[cmdName]?.fullHelp : null;
    
    if (cmdHelp) {
      write(`Error: ${str.replace(/^error: /, "")}\n`);
      write(cmdHelp + "\n");
    } else {
      write(`Error: ${str.replace(/^error: /, "")}\n`);
      write(generateMainHelp() + "\n");
    }
  },
});

program.parse();
