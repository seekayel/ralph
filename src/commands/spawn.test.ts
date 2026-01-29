import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { getCommandTimeout } from "./spawn.js";

describe("getCommandTimeout", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.RALPH_COMMAND_TIMEOUT_MS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env.RALPH_COMMAND_TIMEOUT_MS = undefined;
    } else {
      process.env.RALPH_COMMAND_TIMEOUT_MS = originalEnv;
    }
  });

  it("returns default timeout of 300000ms when env var not set", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = undefined;
    expect(getCommandTimeout()).toBe(300000);
  });

  it("uses custom timeout from environment variable", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "60000";
    expect(getCommandTimeout()).toBe(60000);
  });

  it("returns default for invalid non-numeric env value", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "not-a-number";
    expect(getCommandTimeout()).toBe(300000);
  });

  it("returns default for negative value", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "-1000";
    expect(getCommandTimeout()).toBe(300000);
  });

  it("returns default for zero value", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "0";
    expect(getCommandTimeout()).toBe(300000);
  });

  it("handles very large timeout values", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "3600000"; // 1 hour
    expect(getCommandTimeout()).toBe(3600000);
  });

  it("handles small valid timeout values", () => {
    process.env.RALPH_COMMAND_TIMEOUT_MS = "1000"; // 1 second
    expect(getCommandTimeout()).toBe(1000);
  });
});
