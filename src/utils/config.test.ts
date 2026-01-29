import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractSkillPaths,
  issueToBranchName,
  issueToTopicName,
  issueToWorktreeName,
  loadStepConfig,
  parseIssuePayload,
  readPayloadFromStdinOrFile,
  substituteVariables,
  validateIssueId,
  validateIssueTitle,
  validateSkillPaths,
} from "./config.js";

describe("validateIssueId", () => {
  it("accepts valid alphanumeric ID", () => {
    expect(() => validateIssueId("HLN-123")).not.toThrow();
  });

  it("accepts ID with underscores", () => {
    expect(() => validateIssueId("ISSUE_123")).not.toThrow();
  });

  it("accepts ID with hyphens", () => {
    expect(() => validateIssueId("issue-abc-456")).not.toThrow();
  });

  it("throws on empty string", () => {
    expect(() => validateIssueId("")).toThrow("empty or whitespace-only");
  });

  it("throws on whitespace-only string", () => {
    expect(() => validateIssueId("   ")).toThrow("empty or whitespace-only");
  });

  it("throws on path traversal with ..", () => {
    expect(() => validateIssueId("../../../etc")).toThrow("invalid path characters");
  });

  it("throws on forward slash", () => {
    expect(() => validateIssueId("foo/bar")).toThrow("invalid path characters");
  });

  it("throws on backslash", () => {
    expect(() => validateIssueId("foo\\bar")).toThrow("invalid path characters");
  });

  it("throws on special characters", () => {
    expect(() => validateIssueId("issue@123")).toThrow(
      "alphanumeric characters, hyphens, and underscores"
    );
  });

  it("throws on spaces", () => {
    expect(() => validateIssueId("issue 123")).toThrow(
      "alphanumeric characters, hyphens, and underscores"
    );
  });

  it("throws on reserved name HEAD", () => {
    expect(() => validateIssueId("HEAD")).toThrow("reserved name");
  });

  it("throws on reserved name main (case insensitive)", () => {
    expect(() => validateIssueId("Main")).toThrow("reserved name");
  });

  it("throws on reserved name master", () => {
    expect(() => validateIssueId("master")).toThrow("reserved name");
  });

  it("throws on .git (contains dot which is invalid)", () => {
    // .git is caught by the special characters check before reserved names check
    expect(() => validateIssueId(".git")).toThrow(
      "alphanumeric characters, hyphens, and underscores"
    );
  });

  it("throws on reserved name git", () => {
    expect(() => validateIssueId("git")).toThrow("reserved name");
  });

  it("throws on excessively long ID", () => {
    const longId = "a".repeat(101);
    expect(() => validateIssueId(longId)).toThrow("too long");
  });

  it("accepts ID at max length (100 chars)", () => {
    const maxId = "a".repeat(100);
    expect(() => validateIssueId(maxId)).not.toThrow();
  });
});

describe("validateIssueTitle", () => {
  it("accepts valid title", () => {
    expect(() => validateIssueTitle("Fix login bug")).not.toThrow();
  });

  it("throws on empty string", () => {
    expect(() => validateIssueTitle("")).toThrow("empty or whitespace-only");
  });

  it("throws on whitespace-only string", () => {
    expect(() => validateIssueTitle("   \t\n  ")).toThrow("empty or whitespace-only");
  });

  it("throws on excessively long title", () => {
    const longTitle = "a".repeat(501);
    expect(() => validateIssueTitle(longTitle)).toThrow("too long");
  });

  it("accepts title at max length (500 chars)", () => {
    const maxTitle = "a".repeat(500);
    expect(() => validateIssueTitle(maxTitle)).not.toThrow();
  });

  it("accepts title with special characters", () => {
    expect(() =>
      validateIssueTitle("Fix bug: login fails with @special chars!")
    ).not.toThrow();
  });
});

describe("parseIssuePayload", () => {
  it("parses valid JSON payload", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix login bug",
      description: "Users cannot log in with valid credentials",
    });

    const issue = parseIssuePayload(payload);

    expect(issue.id).toBe("HLN-123");
    expect(issue.title).toBe("Fix login bug");
    expect(issue.description).toBe("Users cannot log in with valid credentials");
  });

  it("trims whitespace from ID", () => {
    const payload = JSON.stringify({
      id: "  HLN-123  ",
      title: "Fix login bug",
      description: "Description",
    });

    const issue = parseIssuePayload(payload);
    expect(issue.id).toBe("HLN-123");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseIssuePayload("not json")).toThrow("Invalid JSON payload");
  });

  it("throws on missing id field", () => {
    const payload = JSON.stringify({
      title: "Fix bug",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'id' field"
    );
  });

  it("throws on missing title field", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'title' field"
    );
  });

  it("throws on missing description field", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix bug",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "Issue payload must have a string 'description' field"
    );
  });

  it("accepts empty description", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "Fix bug",
      description: "",
    });

    const issue = parseIssuePayload(payload);
    expect(issue.description).toBe("");
  });

  it("throws on whitespace-only ID", () => {
    const payload = JSON.stringify({
      id: "   ",
      title: "Fix bug",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow("empty or whitespace-only");
  });

  it("throws on whitespace-only title", () => {
    const payload = JSON.stringify({
      id: "HLN-123",
      title: "   ",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow("empty or whitespace-only");
  });

  it("throws on ID with path traversal", () => {
    const payload = JSON.stringify({
      id: "../../../etc/passwd",
      title: "Fix bug",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow("invalid path characters");
  });

  it("throws on ID with special characters", () => {
    const payload = JSON.stringify({
      id: "issue@123!",
      title: "Fix bug",
      description: "Description",
    });

    expect(() => parseIssuePayload(payload)).toThrow(
      "alphanumeric characters, hyphens, and underscores"
    );
  });
});

describe("substituteVariables", () => {
  const issue = {
    id: "TEST-456",
    title: "Add feature",
    description: "Feature description here",
  };

  it("substitutes issue.id", () => {
    const result = substituteVariables("Issue: ${issue.id}", issue);
    expect(result).toBe("Issue: TEST-456");
  });

  it("substitutes issue.title", () => {
    const result = substituteVariables("Title: ${issue.title}", issue);
    expect(result).toBe("Title: Add feature");
  });

  it("substitutes issue.description", () => {
    const result = substituteVariables("Desc: ${issue.description}", issue);
    expect(result).toBe("Desc: Feature description here");
  });

  it("substitutes multiple variables", () => {
    const template = "[${issue.id}] ${issue.title}: ${issue.description}";
    const result = substituteVariables(template, issue);
    expect(result).toBe("[TEST-456] Add feature: Feature description here");
  });

  it("handles templates with no variables", () => {
    const result = substituteVariables("No variables here", issue);
    expect(result).toBe("No variables here");
  });

  it("handles multiple occurrences of same variable", () => {
    const result = substituteVariables("${issue.id} and ${issue.id}", issue);
    expect(result).toBe("TEST-456 and TEST-456");
  });
});

describe("issueToBranchName", () => {
  it("creates branch name with ralph- prefix", () => {
    expect(issueToBranchName("HLN-123")).toBe("ralph-HLN-123");
  });

  it("handles lowercase ids", () => {
    expect(issueToBranchName("abc-456")).toBe("ralph-abc-456");
  });
});

describe("issueToWorktreeName", () => {
  it("converts to lowercase", () => {
    expect(issueToWorktreeName("HLN-123")).toBe("hln-123");
  });

  it("handles already lowercase", () => {
    expect(issueToWorktreeName("abc-456")).toBe("abc-456");
  });
});

describe("issueToTopicName", () => {
  it("converts title to snake_case", () => {
    expect(issueToTopicName("Add New Feature")).toBe("add_new_feature");
  });

  it("removes special characters", () => {
    expect(issueToTopicName("Fix bug: login!")).toBe("fix_bug_login");
  });

  it("truncates long titles", () => {
    const longTitle = "This is a very long title that exceeds fifty characters limit";
    const result = issueToTopicName(longTitle);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("handles empty title", () => {
    expect(issueToTopicName("")).toBe("");
  });
});

describe("loadStepConfig", () => {
  let tempDir: string;
  const testIssue = {
    id: "TEST-123",
    title: "Test Issue",
    description: "Test description",
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads config file with valid front-matter", async () => {
    const configContent = `---
command: claude
args:
  - "--headless"
  - "--allowedTools"
  - "Read,Grep"
---

This is the prompt body.`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.command).toBe("claude");
    expect(config.args).toEqual(["--headless", "--allowedTools", "Read,Grep"]);
    expect(config.prompt).toBe("This is the prompt body.");
  });

  it("substitutes variables in prompt body", async () => {
    const configContent = `---
command: codex
args: []
---

Issue: \${issue.id}
Title: \${issue.title}
Description: \${issue.description}`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.prompt).toContain("Issue: TEST-123");
    expect(config.prompt).toContain("Title: Test Issue");
    expect(config.prompt).toContain("Description: Test description");
  });

  it("substitutes variables in args", async () => {
    const configContent = `---
command: claude
args:
  - "--issue"
  - "\${issue.id}"
---

Prompt`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.args).toEqual(["--issue", "TEST-123"]);
  });

  it("throws error if config file not found", async () => {
    const nonExistentPath = join(tempDir, "nonexistent.md");

    await expect(loadStepConfig(nonExistentPath, testIssue)).rejects.toThrow(
      "Config file not found"
    );
  });

  it("throws error if front-matter is missing", async () => {
    const configContent = "No front-matter here";

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    await expect(loadStepConfig(configPath, testIssue)).rejects.toThrow(
      "Config file must have YAML front-matter"
    );
  });

  it("throws error if command field is missing", async () => {
    const configContent = `---
args:
  - "--headless"
---

Prompt`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    await expect(loadStepConfig(configPath, testIssue)).rejects.toThrow(
      "Config file missing required 'command' field"
    );
  });

  it("handles config with no args", async () => {
    const configContent = `---
command: claude
---

Simple prompt`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.command).toBe("claude");
    expect(config.args).toEqual([]);
    expect(config.prompt).toBe("Simple prompt");
  });

  it("handles multiline prompt body", async () => {
    const configContent = `---
command: claude
args: []
---

Line 1
Line 2
Line 3`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.prompt).toBe("Line 1\nLine 2\nLine 3");
  });

  it("handles empty prompt body", async () => {
    const configContent = `---
command: claude
args: []
---
`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.prompt).toBe("");
  });
});

describe("readPayloadFromStdinOrFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-payload-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads valid JSON payload from file", async () => {
    const payloadContent = JSON.stringify({
      id: "FILE-123",
      title: "From File",
      description: "Read from file",
    });

    const payloadPath = join(tempDir, "payload.json");
    await writeFile(payloadPath, payloadContent);

    const issue = await readPayloadFromStdinOrFile(payloadPath);

    expect(issue.id).toBe("FILE-123");
    expect(issue.title).toBe("From File");
    expect(issue.description).toBe("Read from file");
  });

  it("throws error if input file not found", async () => {
    const nonExistentPath = join(tempDir, "nonexistent.json");

    await expect(readPayloadFromStdinOrFile(nonExistentPath)).rejects.toThrow(
      "Input file not found"
    );
  });

  it("throws error for invalid JSON in file", async () => {
    const payloadPath = join(tempDir, "invalid.json");
    await writeFile(payloadPath, "not valid json");

    await expect(readPayloadFromStdinOrFile(payloadPath)).rejects.toThrow(
      "Invalid JSON payload"
    );
  });

  it("trims whitespace from file content", async () => {
    const payloadContent = `
      ${JSON.stringify({
        id: "TRIM-123",
        title: "Whitespace Test",
        description: "Has whitespace",
      })}
    `;

    const payloadPath = join(tempDir, "payload.json");
    await writeFile(payloadPath, payloadContent);

    const issue = await readPayloadFromStdinOrFile(payloadPath);

    expect(issue.id).toBe("TRIM-123");
  });

  it("validates payload fields from file", async () => {
    const payloadContent = JSON.stringify({
      id: "TEST-123",
      title: "Missing description",
    });

    const payloadPath = join(tempDir, "payload.json");
    await writeFile(payloadPath, payloadContent);

    await expect(readPayloadFromStdinOrFile(payloadPath)).rejects.toThrow(
      "Issue payload must have a string 'description' field"
    );
  });
});

describe("extractSkillPaths", () => {
  it("extracts single skill path from text", () => {
    const text = "Use the skill defined in `_agents/skills/research-plan-implement/skill.md`";
    const paths = extractSkillPaths(text);
    expect(paths).toEqual(["_agents/skills/research-plan-implement/skill.md"]);
  });

  it("extracts multiple skill paths from text", () => {
    const text = `
      Use \`_agents/skills/research-plan-implement/skill.md\` for research.
      Use \`_agents/skills/code-review/skill.md\` for review.
    `;
    const paths = extractSkillPaths(text);
    expect(paths).toContain("_agents/skills/research-plan-implement/skill.md");
    expect(paths).toContain("_agents/skills/code-review/skill.md");
    expect(paths.length).toBe(2);
  });

  it("returns empty array when no skill paths found", () => {
    const text = "No skill paths in this text";
    const paths = extractSkillPaths(text);
    expect(paths).toEqual([]);
  });

  it("deduplicates repeated skill paths", () => {
    const text = `
      Use \`_agents/skills/code-review/skill.md\` first.
      Then use \`_agents/skills/code-review/skill.md\` again.
    `;
    const paths = extractSkillPaths(text);
    expect(paths).toEqual(["_agents/skills/code-review/skill.md"]);
  });

  it("extracts paths without backticks", () => {
    const text = "Use _agents/skills/test/skill.md for testing";
    const paths = extractSkillPaths(text);
    expect(paths).toEqual(["_agents/skills/test/skill.md"]);
  });
});

describe("validateSkillPaths", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-skill-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("does not throw when skill file exists", async () => {
    const skillDir = join(tempDir, "_agents/skills/test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "skill.md"), "# Test Skill");

    const prompt = "Use `_agents/skills/test-skill/skill.md`";

    await expect(validateSkillPaths(prompt, tempDir)).resolves.toBeUndefined();
  });

  it("throws when skill file does not exist", async () => {
    const prompt = "Use `_agents/skills/nonexistent/skill.md`";

    await expect(validateSkillPaths(prompt, tempDir)).rejects.toThrow(
      "Skill file(s) not found: _agents/skills/nonexistent/skill.md"
    );
  });

  it("throws with multiple missing skill files", async () => {
    const prompt = `
      Use \`_agents/skills/missing1/skill.md\`.
      Also use \`_agents/skills/missing2/skill.md\`.
    `;

    await expect(validateSkillPaths(prompt, tempDir)).rejects.toThrow(
      "Skill file(s) not found:"
    );
  });

  it("does not throw when prompt has no skill paths", async () => {
    const prompt = "No skill paths in this prompt";

    await expect(validateSkillPaths(prompt, tempDir)).resolves.toBeUndefined();
  });

  it("includes worktree directory in error message", async () => {
    const prompt = "Use `_agents/skills/nonexistent/skill.md`";

    await expect(validateSkillPaths(prompt, tempDir)).rejects.toThrow(
      `Ensure these files exist in the worktree directory: ${tempDir}`
    );
  });
});

describe("loadStepConfig with skill validation", () => {
  let tempDir: string;
  const testIssue = {
    id: "TEST-123",
    title: "Test Issue",
    description: "Test description",
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-config-skill-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("validates skill paths when worktreeDir is provided", async () => {
    const configContent = `---
command: claude
args: []
---

Use the skill in \`_agents/skills/nonexistent/skill.md\``;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    await expect(
      loadStepConfig(configPath, testIssue, tempDir)
    ).rejects.toThrow("Skill file(s) not found");
  });

  it("skips skill validation when worktreeDir is not provided", async () => {
    const configContent = `---
command: claude
args: []
---

Use the skill in \`_agents/skills/nonexistent/skill.md\``;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue);

    expect(config.command).toBe("claude");
    expect(config.prompt).toContain("_agents/skills/nonexistent/skill.md");
  });

  it("succeeds when skill file exists", async () => {
    const skillDir = join(tempDir, "_agents/skills/test-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "skill.md"), "# Test Skill");

    const configContent = `---
command: claude
args: []
---

Use the skill in \`_agents/skills/test-skill/skill.md\``;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const config = await loadStepConfig(configPath, testIssue, tempDir);

    expect(config.command).toBe("claude");
    expect(config.prompt).toContain("_agents/skills/test-skill/skill.md");
  });
});
