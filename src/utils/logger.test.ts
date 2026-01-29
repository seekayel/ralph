import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { debug, debugObject, info, isVerbose, setVerbose } from "./logger.js";

describe("logger", () => {
  let consoleSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    setVerbose(false);
    consoleSpy = mock(() => {});
    console.log = consoleSpy;
  });

  afterEach(() => {
    setVerbose(false);
  });

  describe("setVerbose and isVerbose", () => {
    test("verbose is disabled by default", () => {
      expect(isVerbose()).toBe(false);
    });

    test("setVerbose(true) enables verbose mode", () => {
      setVerbose(true);
      expect(isVerbose()).toBe(true);
    });

    test("setVerbose(false) disables verbose mode", () => {
      setVerbose(true);
      setVerbose(false);
      expect(isVerbose()).toBe(false);
    });
  });

  describe("debug", () => {
    test("does not log when verbose is disabled", () => {
      debug("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("logs when verbose is enabled", () => {
      setVerbose(true);
      debug("test message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    test("includes timestamp and DEBUG prefix", () => {
      setVerbose(true);
      debug("test message");
      const call = consoleSpy.mock.calls[0];
      expect(call[0]).toMatch(/^\[DEBUG \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(call[0]).toContain("test message");
    });

    test("passes additional arguments", () => {
      setVerbose(true);
      debug("test", "arg1", "arg2");
      const call = consoleSpy.mock.calls[0];
      expect(call[1]).toBe("arg1");
      expect(call[2]).toBe("arg2");
    });
  });

  describe("debugObject", () => {
    test("does not log when verbose is disabled", () => {
      debugObject("label", { key: "value" });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("logs label and JSON when verbose is enabled", () => {
      setVerbose(true);
      debugObject("test object", { key: "value" });
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      const firstCall = consoleSpy.mock.calls[0];
      expect(firstCall[0]).toContain("test object");
      const secondCall = consoleSpy.mock.calls[1];
      expect(secondCall[0]).toContain('"key": "value"');
    });
  });

  describe("info", () => {
    test("does not log when verbose is disabled", () => {
      info("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("logs with INFO prefix when verbose is enabled", () => {
      setVerbose(true);
      info("test message");
      const call = consoleSpy.mock.calls[0];
      expect(call[0]).toContain("[INFO]");
      expect(call[0]).toContain("test message");
    });
  });
});
