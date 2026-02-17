import { $ } from "bun";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitRepositoryRoot, isGitRepository } from "./git.js";

describe("isGitRepository", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-git-test-"));
    repoDir = join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    await $`git -C ${repoDir} init`.quiet();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns false for non-git directory", async () => {
    const outsideDir = join(tempDir, "not-a-repo");
    await mkdir(outsideDir, { recursive: true });
    const result = await isGitRepository(outsideDir);
    expect(result).toBe(false);
  });

  it("returns true for git repository root", async () => {
    const result = await isGitRepository(repoDir);
    expect(result).toBe(true);
  });

  it("returns true for nested directory inside git repository", async () => {
    const nestedDir = join(repoDir, "src", "nested");
    await mkdir(nestedDir, { recursive: true });
    const result = await isGitRepository(nestedDir);
    expect(result).toBe(true);
  });
});

describe("getGitRepositoryRoot", () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-git-root-test-"));
    repoDir = join(tempDir, "repo");
    await mkdir(repoDir, { recursive: true });
    await $`git -C ${repoDir} init`.quiet();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-git directory", async () => {
    const outsideDir = join(tempDir, "outside");
    await mkdir(outsideDir, { recursive: true });
    const root = await getGitRepositoryRoot(outsideDir);
    expect(root).toBeNull();
  });

  it("returns repository root for repository directory", async () => {
    const root = await getGitRepositoryRoot(repoDir);
    expect(root).not.toBeNull();
    expect(await realpath(root as string)).toBe(await realpath(repoDir));
  });

  it("returns repository root for nested directory", async () => {
    const nestedDir = join(repoDir, "src", "deep");
    await mkdir(nestedDir, { recursive: true });
    const root = await getGitRepositoryRoot(nestedDir);
    expect(root).not.toBeNull();
    expect(await realpath(root as string)).toBe(await realpath(repoDir));
  });
});
