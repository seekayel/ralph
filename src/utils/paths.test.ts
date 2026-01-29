import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readdir } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  getRalphRootDir,
  getRalphConfigDir,
  getRalphAgentsDir,
  syncAgentsToWorktree,
} from "./paths.js";

describe("getRalphRootDir", () => {
  it("returns a valid path", () => {
    const rootDir = getRalphRootDir();
    expect(typeof rootDir).toBe("string");
    expect(rootDir.length).toBeGreaterThan(0);
  });

  it("returns path containing main directory structure", () => {
    const rootDir = getRalphRootDir();
    // The ralph root should contain src/, config/, and _agents/
    expect(rootDir).toContain("ralph");
  });
});

describe("getRalphConfigDir", () => {
  it("returns path ending with /config", () => {
    const configDir = getRalphConfigDir();
    expect(configDir).toEndWith("/config");
  });

  it("is based on getRalphRootDir", () => {
    const rootDir = getRalphRootDir();
    const configDir = getRalphConfigDir();
    expect(configDir).toBe(`${rootDir}/config`);
  });
});

describe("getRalphAgentsDir", () => {
  it("returns path ending with /_agents", () => {
    const agentsDir = getRalphAgentsDir();
    expect(agentsDir).toEndWith("/_agents");
  });

  it("is based on getRalphRootDir", () => {
    const rootDir = getRalphRootDir();
    const agentsDir = getRalphAgentsDir();
    expect(agentsDir).toBe(`${rootDir}/_agents`);
  });
});

describe("syncAgentsToWorktree", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-sync-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates .ralph directory in worktree", async () => {
    const ralphDir = await syncAgentsToWorktree(tempDir);

    expect(ralphDir).toBe(`${tempDir}/.ralph`);

    const file = Bun.file(`${tempDir}/.ralph`);
    // Check directory exists by trying to read it
    const entries = await readdir(`${tempDir}/.ralph`);
    expect(entries).toContain("_agents");
  });

  it("copies _agents directory to worktree", async () => {
    await syncAgentsToWorktree(tempDir);

    // Check that _agents was copied
    const agentsEntries = await readdir(`${tempDir}/.ralph/_agents`);
    expect(agentsEntries).toContain("skills");
  });

  it("copies skills directory content", async () => {
    await syncAgentsToWorktree(tempDir);

    // Check that skills were copied
    const skillsEntries = await readdir(`${tempDir}/.ralph/_agents/skills`);
    expect(skillsEntries.length).toBeGreaterThan(0);
  });

  it("cleans existing .ralph directory before syncing", async () => {
    // Create an old .ralph directory with some content
    await mkdir(`${tempDir}/.ralph`, { recursive: true });
    await Bun.write(`${tempDir}/.ralph/old-file.txt`, "old content");

    await syncAgentsToWorktree(tempDir);

    // Old file should be gone
    const oldFile = Bun.file(`${tempDir}/.ralph/old-file.txt`);
    expect(await oldFile.exists()).toBe(false);

    // But _agents should exist
    const entries = await readdir(`${tempDir}/.ralph`);
    expect(entries).toContain("_agents");
  });

  it("returns the .ralph directory path", async () => {
    const result = await syncAgentsToWorktree(tempDir);
    expect(result).toBe(`${tempDir}/.ralph`);
  });
});
