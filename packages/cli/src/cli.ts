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
import { sessionCommand } from "./commands/session.js";
import { apiCommand } from "./commands/api.js";
import { searchCommand } from "./commands/search.js";
import { mediaCommand } from "./commands/media.js";
import { configCommand } from "./commands/config.js";

const program = new Command();

program
  .name("air")
  .description("AIR - AI-optimized Information Representation")
  .version("0.1.0", "-v, --version", "output the version number")
  .enablePositionalOptions();

program.addCommand(readCommand);
program.addCommand(bashCommand);
program.addCommand(grepCommand);
program.addCommand(webCommand);
program.addCommand(testCommand);
program.addCommand(lsCommand);
program.addCommand(diffCommand);
program.addCommand(editCommand);
program.addCommand(sessionCommand);
program.addCommand(apiCommand);
program.addCommand(searchCommand);
program.addCommand(mediaCommand);
program.addCommand(configCommand);

program.parse();
