/**
 * AIR Control Tools for OpenClaw
 *
 * Provides air_on() and air_off() tools for controlling compression.
 */

import { enable, disable } from "./state.js";

// =============================================================================
// Configuration
// =============================================================================

export const DEFAULT_DISABLED_CALLS = 10;

// =============================================================================
// Tool definitions (OpenClaw format)
// =============================================================================

/**
 * OpenClaw tool definition interface.
 * Note: This is a simplified version - actual OpenClaw types may differ.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      optional?: boolean;
    }
  >;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/**
 * air_on tool - Re-enable AIR compression.
 */
export const airOnTool: ToolDefinition = {
  name: "air_on",
  description: "Enable AIR compression for tool outputs (default state)",
  parameters: {},
  execute: async () => {
    enable();
    return "AIR compression enabled.";
  },
};

/**
 * air_off tool - Temporarily disable AIR compression.
 */
export const airOffTool: ToolDefinition = {
  name: "air_off",
  description:
    "Disable AIR compression to see raw tool outputs. Auto-expires after N tool calls (default: 10).",
  parameters: {
    calls: {
      type: "number",
      description: "Number of tool calls before auto-enabling (default: 10)",
      optional: true,
    },
  },
  execute: async (args: Record<string, unknown>) => {
    const calls =
      typeof args.calls === "number" ? args.calls : DEFAULT_DISABLED_CALLS;
    disable(calls);
    return `AIR compression disabled for the next ${calls} tool calls.`;
  },
};
