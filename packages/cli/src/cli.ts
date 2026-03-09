#!/usr/bin/env node

/**
 * AIR CLI - AI-optimized Information Representation
 *
 * Main entry point for the `air` command.
 */

import { Command } from "commander";
import { readCommand } from "./commands/read.js";
import { bashCommand } from "./commands/bash.js";

const program = new Command();

program
  .name("air")
  .description("AIR - AI-optimized Information Representation")
  .version("0.1.0");

program.addCommand(readCommand);
program.addCommand(bashCommand);

program.parse();
