import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readdir, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getEmbeddedAsset,
  getEmbeddedConfigs,
  getAssetsHash,
  needsExtraction,
  extractAssets,
  extractAssetsIfNeeded,
} from "./assets.js";

describe("getEmbeddedAsset", () => {
  it("returns content for valid _agents path", () => {
    const content = getEmbeddedAsset("_agents/AGENTS.md");
    expect(content).toBeDefined();
    expect(content).toContain("Sub-Agents");
  });

  it("returns content for valid config path", () => {
    const content = getEmbeddedAsset("config/research.md");
    expect(content).toBeDefined();
    expect(content).toContain("command:");
  });

  it("returns undefined for invalid path", () => {
    const content = getEmbeddedAsset("nonexistent/file.md");
    expect(content).toBeUndefined();
  });

  it("returns content for skill file", () => {
    const content = getEmbeddedAsset(
      "_agents/skills/research-plan-implement/skill.md"
    );
    expect(content).toBeDefined();
    expect(content!.length).toBeGreaterThan(0);
  });
});

describe("getEmbeddedConfigs", () => {
  it("returns all config files", () => {
    const configs = getEmbeddedConfigs();
    expect(configs.size).toBe(7);
    expect(configs.has("config/research.md")).toBe(true);
    expect(configs.has("config/plan.md")).toBe(true);
    expect(configs.has("config/implement.md")).toBe(true);
    expect(configs.has("config/validate.md")).toBe(true);
    expect(configs.has("config/review.md")).toBe(true);
    expect(configs.has("config/publish.md")).toBe(true);
    expect(configs.has("config/spawn.md")).toBe(true);
  });

  it("does not include _agents files", () => {
    const configs = getEmbeddedConfigs();
    for (const [path] of configs) {
      expect(path.startsWith("config/")).toBe(true);
    }
  });
});

describe("getAssetsHash", () => {
  it("returns consistent hash", () => {
    const hash1 = getAssetsHash();
    const hash2 = getAssetsHash();
    expect(hash1).toBe(hash2);
  });

  it("returns a non-empty string", () => {
    const hash = getAssetsHash();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe("needsExtraction", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-assets-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns true when hash file does not exist", async () => {
    const result = await needsExtraction(tempDir);
    expect(result).toBe(true);
  });

  it("returns true when hash file has different content", async () => {
    await mkdir(tempDir, { recursive: true });
    await Bun.write(`${tempDir}/.assets-hash`, "different-hash");

    const result = await needsExtraction(tempDir);
    expect(result).toBe(true);
  });

  it("returns false when hash file matches", async () => {
    await mkdir(tempDir, { recursive: true });
    await Bun.write(`${tempDir}/.assets-hash`, getAssetsHash());

    const result = await needsExtraction(tempDir);
    expect(result).toBe(false);
  });
});

describe("extractAssets", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-extract-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("extracts all assets when no prefix is specified", async () => {
    await extractAssets(tempDir);

    // Check both _agents and config were extracted
    const entries = await readdir(tempDir);
    expect(entries).toContain("_agents");
    expect(entries).toContain("config");
  });

  it("extracts only _agents when prefix is specified", async () => {
    await extractAssets(tempDir, "_agents");

    const entries = await readdir(tempDir);
    expect(entries).toContain("_agents");
    expect(entries).not.toContain("config");
  });

  it("extracts only config when prefix is specified", async () => {
    await extractAssets(tempDir, "config");

    const entries = await readdir(tempDir);
    expect(entries).not.toContain("_agents");
    expect(entries).toContain("config");
  });

  it("creates proper directory structure", async () => {
    await extractAssets(tempDir, "_agents");

    const skillsDir = await readdir(`${tempDir}/_agents/skills`);
    expect(skillsDir).toContain("code-review");
    expect(skillsDir).toContain("research-plan-implement");
  });

  it("writes file contents correctly", async () => {
    await extractAssets(tempDir, "config");

    const content = await readFile(`${tempDir}/config/research.md`, "utf-8");
    expect(content).toContain("command:");
  });
});

describe("extractAssetsIfNeeded", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-extract-if-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("extracts and returns true when directory is empty", async () => {
    const result = await extractAssetsIfNeeded(tempDir, "_agents");

    expect(result).toBe(true);
    const entries = await readdir(tempDir);
    expect(entries).toContain("_agents");
    expect(entries).toContain(".assets-hash");
  });

  it("skips extraction and returns false when hash matches", async () => {
    // First extraction
    await extractAssetsIfNeeded(tempDir, "_agents");

    // Add a marker file
    await Bun.write(`${tempDir}/marker.txt`, "test");

    // Second extraction should skip
    const result = await extractAssetsIfNeeded(tempDir, "_agents");

    expect(result).toBe(false);
    // Marker should still exist (directory wasn't cleaned)
    const markerExists = await Bun.file(`${tempDir}/marker.txt`).exists();
    expect(markerExists).toBe(true);
  });

  it("re-extracts when hash changes", async () => {
    // Create a directory with old hash
    await mkdir(tempDir, { recursive: true });
    await Bun.write(`${tempDir}/.assets-hash`, "old-hash");
    await Bun.write(`${tempDir}/old-file.txt`, "old content");

    const result = await extractAssetsIfNeeded(tempDir, "_agents");

    expect(result).toBe(true);
    // Old file should be gone (directory was cleaned)
    const oldFileExists = await Bun.file(`${tempDir}/old-file.txt`).exists();
    expect(oldFileExists).toBe(false);
  });
});
