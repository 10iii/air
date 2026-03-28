/**
 * AIR OpenClaw Plugin
 *
 * Provides transparent compression for tool outputs via hooks.
 * Only exposes air_on() and air_off() control tools.
 *
 * Design: OPENCLAW-PLUGIN-DESIGN.md
 */

import { airOnTool, airOffTool } from "./tools.js";
import {
  handleToolResultPersist,
  type ToolResultPersistEvent,
} from "./hooks.js";

// Re-export types for consumers
export type {
  ToolResultPersistEvent,
  ToolResultPersistReturn,
  Message,
} from "./hooks.js";
export type { ToolDefinition } from "./tools.js";

// Re-export utilities for testing/extension
export { selectCompressor, shouldCompress, getCompressedTools } from "./compressor.js";
export { isEnabled, enable, disable, reset } from "./state.js";

// =============================================================================
// Types (OpenClaw Plugin API)
// =============================================================================

/**
 * OpenClaw Plugin API interface.
 * Note: This is a simplified version - actual OpenClaw types may differ.
 */
export interface PluginApi {
  registerTool: (name: string, definition: unknown) => void;
  on: (event: string, handler: (event: unknown) => unknown) => void;
}

// =============================================================================
// Type guards
// =============================================================================

/**
 * Validate that an unknown value is a ToolResultPersistEvent.
 */
function isToolResultPersistEvent(
  event: unknown,
): event is ToolResultPersistEvent {
  if (typeof event !== "object" || event === null) return false;
  const obj = event as Record<string, unknown>;
  return (
    typeof obj.toolName === "string" &&
    typeof obj.message === "object" &&
    obj.message !== null
  );
}

// =============================================================================
// Plugin lifecycle
// =============================================================================

/**
 * Activate the AIR plugin.
 * Called by OpenClaw when the plugin is loaded.
 */
export function activate(api: PluginApi): void {
  // Register control tools
  api.registerTool(airOnTool.name, airOnTool);
  api.registerTool(airOffTool.name, airOffTool);

  // Register compression hook with type validation
  api.on("tool_result_persist", (event: unknown) => {
    if (!isToolResultPersistEvent(event)) {
      console.warn("AIR: Invalid tool_result_persist event received");
      return {};
    }
    return handleToolResultPersist(event);
  });
}

/**
 * Deactivate the AIR plugin.
 * Called by OpenClaw when the plugin is unloaded.
 */
export function deactivate(): void {
  // Cleanup if needed (state reset handled by session end)
}

// =============================================================================
// Default export
// =============================================================================

export default { activate, deactivate };
