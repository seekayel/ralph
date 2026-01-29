import { describe, expect, it } from "bun:test";
import { isGitBareWorktreeRoot } from "./git.js";

describe("isGitBareWorktreeRoot", () => {
  it("returns false for non-existent directory", async () => {
    const result = await isGitBareWorktreeRoot("/non/existent/path");
    expect(result).toBe(false);
  });

  it("returns false for regular directory without .bare", async () => {
    const result = await isGitBareWorktreeRoot("/tmp");
    expect(result).toBe(false);
  });

  it("returns false for directory with only .git file", async () => {
    const result = await isGitBareWorktreeRoot(process.cwd());
    expect(result).toBe(false);
  });
});
