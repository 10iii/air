/**
 * Tests for AIR State Management
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  isEnabled,
  enable,
  disable,
  decrementAndCheck,
  getRemainingCalls,
  reset,
} from "../state.js";

describe("AIR State", () => {
  beforeEach(() => {
    reset();
  });

  describe("isEnabled", () => {
    it("should return true by default", () => {
      expect(isEnabled()).toBe(true);
    });

    it("should return false after disable()", () => {
      disable(5);
      expect(isEnabled()).toBe(false);
    });

    it("should return true after enable()", () => {
      disable(5);
      enable();
      expect(isEnabled()).toBe(true);
    });
  });

  describe("disable", () => {
    it("should set remaining calls correctly", () => {
      disable(10);
      expect(getRemainingCalls()).toBe(10);
    });

    it("should disable compression", () => {
      disable(5);
      expect(isEnabled()).toBe(false);
    });
  });

  describe("enable", () => {
    it("should reset remaining calls to 0", () => {
      disable(10);
      enable();
      expect(getRemainingCalls()).toBe(0);
    });

    it("should enable compression", () => {
      disable(5);
      enable();
      expect(isEnabled()).toBe(true);
    });
  });

  describe("decrementAndCheck", () => {
    it("should decrement remaining calls", () => {
      disable(5);
      decrementAndCheck();
      expect(getRemainingCalls()).toBe(4);
    });

    it("should return false when not yet re-enabled", () => {
      disable(5);
      expect(decrementAndCheck()).toBe(false);
    });

    it("should auto-enable when countdown reaches 0", () => {
      disable(2);
      decrementAndCheck(); // 1 remaining
      expect(isEnabled()).toBe(false);
      
      decrementAndCheck(); // 0 remaining, auto-enable
      expect(isEnabled()).toBe(true);
    });

    it("should return true when auto-enabling", () => {
      disable(1);
      expect(decrementAndCheck()).toBe(true);
    });

    it("should not decrement when already enabled", () => {
      // Already enabled, should not affect state
      expect(decrementAndCheck()).toBe(false);
      expect(getRemainingCalls()).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset to default state", () => {
      disable(10);
      reset();
      expect(isEnabled()).toBe(true);
      expect(getRemainingCalls()).toBe(0);
    });
  });
});
