import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncAgentsToWorktree } from "./paths.js";
import { getAssetsHash } from "./assets.js";

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

    const entries = await readdir(`${tempDir}/.ralph`);
    expect(entries).toContain("_agents");
  });

  it("extracts _agents directory from embedded assets", async () => {
    await syncAgentsToWorktree(tempDir);

    // Check that _agents was extracted
    const agentsEntries = await readdir(`${tempDir}/.ralph/_agents`);
    expect(agentsEntries).toContain("skills");
    expect(agentsEntries).toContain("agents");
    expect(agentsEntries).toContain("AGENTS.md");
  });

  it("extracts skills directory content", async () => {
    await syncAgentsToWorktree(tempDir);

    // Check that skills were extracted
    const skillsEntries = await readdir(`${tempDir}/.ralph/_agents/skills`);
    expect(skillsEntries).toContain("code-review");
    expect(skillsEntries).toContain("research-plan-implement");
  });

  it("writes hash file for caching", async () => {
    await syncAgentsToWorktree(tempDir);

    const hashContent = await readFile(
      `${tempDir}/.ralph/.assets-hash`,
      "utf-8"
    );
    expect(hashContent.trim()).toBe(getAssetsHash());
  });

  it("cleans existing .ralph directory before syncing when hash changes", async () => {
    // Create an old .ralph directory with some content and a different hash
    await mkdir(`${tempDir}/.ralph`, { recursive: true });
    await Bun.write(`${tempDir}/.ralph/old-file.txt`, "old content");
    await Bun.write(`${tempDir}/.ralph/.assets-hash`, "old-hash");

    await syncAgentsToWorktree(tempDir);

    // Old file should be gone
    const oldFile = Bun.file(`${tempDir}/.ralph/old-file.txt`);
    expect(await oldFile.exists()).toBe(false);

    // But _agents should exist
    const entries = await readdir(`${tempDir}/.ralph`);
    expect(entries).toContain("_agents");
  });

  it("skips extraction when hash matches", async () => {
    // First sync
    await syncAgentsToWorktree(tempDir);

    // Add a marker file
    await Bun.write(`${tempDir}/.ralph/marker.txt`, "test");

    // Second sync should not delete marker (no re-extraction)
    await syncAgentsToWorktree(tempDir);

    const markerExists = await Bun.file(`${tempDir}/.ralph/marker.txt`).exists();
    expect(markerExists).toBe(true);
  });

  it("returns the .ralph directory path", async () => {
    const result = await syncAgentsToWorktree(tempDir);
    expect(result).toBe(`${tempDir}/.ralph`);
  });
});
