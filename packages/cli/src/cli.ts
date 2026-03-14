#!/usr/bin/env node

/**
 * AIR CLI - AI-optimized Information Representation
 *
 * Main entry point for the `air` command.
 */

import { Command } from "commander";
import { readCommand } from "./commands/read.js";
import { bashCommand } from "./commands/bash.js";
import { grepCommand } from "./commands/grep.js";
import { webCommand } from "./commands/web.js";
import { testCommand } from "./commands/test.js";
import { lsCommand } from "./commands/ls.js";
import { diffCommand } from "./commands/diff.js";
import { editCommand } from "./commands/edit.js";

const program = new Command();

program
  .name("air")
  .description("AIR - AI-optimized Information Representation")
  .version("0.1.0");

program.addCommand(readCommand);
program.addCommand(bashCommand);
program.addCommand(grepCommand);
program.addCommand(webCommand);
program.addCommand(testCommand);
program.addCommand(lsCommand);
program.addCommand(diffCommand);
program.addCommand(editCommand);

program.parse();
