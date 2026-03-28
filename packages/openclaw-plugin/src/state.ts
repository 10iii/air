/**
 * AIR State Management
 *
 * Tracks whether AIR compression is enabled/disabled per session.
 * Supports auto-expiry countdown after air_off().
 */

// Per-session state (not persisted across sessions)
interface AirState {
  enabled: boolean;
  disabledCallsRemaining: number;
}

const state: AirState = {
  enabled: true,
  disabledCallsRemaining: 0,
};

/**
 * Check if AIR compression is currently enabled.
 */
export function isEnabled(): boolean {
  return state.enabled;
}

/**
 * Enable AIR compression (default state).
 */
export function enable(): void {
  state.enabled = true;
  state.disabledCallsRemaining = 0;
}

/**
 * Disable AIR compression for a specified number of tool calls.
 */
export function disable(calls: number): void {
  state.enabled = false;
  state.disabledCallsRemaining = calls;
}

/**
 * Decrement the disabled calls counter and check if auto-enable should occur.
 * Returns true if just re-enabled, false otherwise.
 */
export function decrementAndCheck(): boolean {
  if (state.disabledCallsRemaining > 0) {
    state.disabledCallsRemaining--;
    if (state.disabledCallsRemaining === 0) {
      state.enabled = true; // Auto re-enable
      return true; // Just re-enabled
    }
  }
  return false;
}

/**
 * Get remaining disabled calls (for testing/debugging).
 */
export function getRemainingCalls(): number {
  return state.disabledCallsRemaining;
}

/**
 * Reset state to defaults (for testing).
 */
export function reset(): void {
  state.enabled = true;
  state.disabledCallsRemaining = 0;
}
