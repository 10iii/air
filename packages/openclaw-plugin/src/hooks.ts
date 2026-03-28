/**
 * AIR Hook Handler for OpenClaw
 *
 * Handles the tool_result_persist event to compress tool outputs.
 */

import { selectCompressor, shouldCompress } from "./compressor.js";
import { isEnabled, decrementAndCheck } from "./state.js";

// =============================================================================
// Configuration
// =============================================================================

export const MIN_GAIN = 200;

// =============================================================================
// Types (OpenClaw event types)
// =============================================================================

/**
 * Message content in OpenClaw.
 */
export interface Message {
  role: string;
  content: string | unknown;
  [key: string]: unknown;
}

/**
 * Event passed to tool_result_persist hook.
 */
export interface ToolResultPersistEvent {
  toolName: string;
  message: Message;
  [key: string]: unknown;
}

/**
 * Return type for tool_result_persist hook.
 */
export interface ToolResultPersistReturn {
  message?: Message;
}

// =============================================================================
// Hook handler
// =============================================================================

/**
 * Handle tool_result_persist event.
 * Compresses tool output if beneficial.
 */
export function handleToolResultPersist(
  event: ToolResultPersistEvent,
): ToolResultPersistReturn {
  const { toolName, message } = event;

  // Skip air_on/air_off themselves
  if (toolName === "air_on" || toolName === "air_off") {
    return {};
  }

  // Check if disabled (with auto-expiry)
  if (!isEnabled()) {
    decrementAndCheck();
    return {}; // No compression
  }

  // Get message content
  const content = typeof message.content === "string" ? message.content : "";
  if (!content) {
    return {};
  }

  // Select compressor (null if tool not in whitelist)
  const compressor = selectCompressor(toolName);
  if (!compressor) {
    return {};
  }

  // Compress
  try {
    const result = compressor.compress(content);

    if (!shouldCompress(content, result.output, MIN_GAIN)) {
      return {}; // Gain too small
    }

    const ratio = Math.round(
      ((content.length - result.output.length) / content.length) * 100,
    );

    return {
      message: {
        ...message,
        content: `${result.output}\n[AIR: compressed ${ratio}% | air_off() for raw]`,
      },
    };
  } catch (error) {
    // Log error for debugging but don't crash
    console.warn("AIR compression failed:", toolName, error);
    return {}; // Compression failed, return original
  }
}
