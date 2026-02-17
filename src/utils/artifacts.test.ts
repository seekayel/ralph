import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findWorkflowArtifact,
  isWorkflowArtifactFileName,
} from "./artifacts.js";

describe("isWorkflowArtifactFileName", () => {
  it("accepts NNN_topic_name.md format", () => {
    expect(isWorkflowArtifactFileName("001_add_feature.md")).toBe(true);
  });

  it("rejects issue-id-prefixed artifact names", () => {
    expect(isWorkflowArtifactFileName("HLN-123_add_feature.md")).toBe(false);
  });

  it("rejects uppercase topic names", () => {
    expect(isWorkflowArtifactFileName("001_Add_Feature.md")).toBe(false);
  });
});

describe("findWorkflowArtifact", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-artifact-test-"));
    await mkdir(join(tempDir, "_thoughts", "research"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null when no valid artifacts exist", async () => {
    await writeFile(
      join(tempDir, "_thoughts", "research", "HLN-123_add_feature.md"),
      "# legacy"
    );

    const result = await findWorkflowArtifact(tempDir, "research");
    expect(result).toBeNull();
  });

  it("returns the latest matching artifact by sequence name", async () => {
    await writeFile(
      join(tempDir, "_thoughts", "research", "001_initial_research.md"),
      "# research"
    );
    await writeFile(
      join(tempDir, "_thoughts", "research", "002_refined_research.md"),
      "# research"
    );

    const result = await findWorkflowArtifact(tempDir, "research");
    expect(result).toContain("002_refined_research.md");
  });
});
