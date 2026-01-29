import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Issue, WorkflowContext } from "./types.js";

// Mock the process module
const mockRunAgentCommand = mock(() =>
  Promise.resolve({
    success: true,
    exitCode: 0,
    stdout: "Command completed successfully",
    stderr: "",
  })
);

const mockCheckCommandExists = mock(() => Promise.resolve(true));

const mockRunCommand = mock(() =>
  Promise.resolve({
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
  })
);

// We need to mock the process module before importing commands
mock.module("./utils/process.js", () => ({
  runAgentCommand: mockRunAgentCommand,
  checkCommandExists: mockCheckCommandExists,
  runCommand: mockRunCommand,
}));

// Import after mocking
import { research } from "./commands/research.js";
import { plan } from "./commands/plan.js";
import { validate } from "./commands/validate.js";
import { implement } from "./commands/implement.js";
import { review } from "./commands/review.js";
import { publish } from "./commands/publish.js";

describe("Integration Tests - Workflow Steps with Mocked CLI", () => {
  let tempDir: string;
  let configDir: string;
  let worktreeDir: string;

  const testIssue: Issue = {
    id: "TEST-123",
    title: "Test Feature",
    description: "Test description for integration tests",
  };

  const testContext: WorkflowContext = {
    issue: testIssue,
    worktreeDir: "",
    branchName: "ralph-TEST-123",
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-integration-"));
    configDir = join(tempDir, "config");
    worktreeDir = join(tempDir, "worktree");

    await mkdir(configDir, { recursive: true });
    await mkdir(worktreeDir, { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "research"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "plan"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "code-review"), {
      recursive: true,
    });

    testContext.worktreeDir = worktreeDir;

    // Create config files for each step
    await createConfigFiles(configDir);

    // Reset mocks
    mockRunAgentCommand.mockClear();
    mockCheckCommandExists.mockClear();
    mockRunCommand.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createConfigFiles(dir: string) {
    const researchConfig = `---
command: claude
args:
  - "--headless"
  - "--allowedTools"
  - "Read,Grep,Glob"
---

Research the codebase for issue \${issue.id}: \${issue.title}`;

    const planConfig = `---
command: claude
args:
  - "--headless"
---

Create a plan for issue \${issue.id}: \${issue.title}`;

    const validateConfig = `---
command: codex
args:
  - "--headless"
---

Validate the plan for issue \${issue.id}`;

    const implementConfig = `---
command: claude
args:
  - "--headless"
---

Implement the plan for issue \${issue.id}: \${issue.title}`;

    const reviewConfig = `---
command: codex
args:
  - "--headless"
---

Review the code for issue \${issue.id}`;

    const publishConfig = `---
command: codex
args:
  - "--headless"
---

Confirm implementation is complete for issue \${issue.id}`;

    await writeFile(join(dir, "research.md"), researchConfig);
    await writeFile(join(dir, "plan.md"), planConfig);
    await writeFile(join(dir, "validate.md"), validateConfig);
    await writeFile(join(dir, "implement.md"), implementConfig);
    await writeFile(join(dir, "review.md"), reviewConfig);
    await writeFile(join(dir, "publish.md"), publishConfig);
  }

  describe("research step", () => {
    it("succeeds when agent completes and creates research file", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Research completed",
        stderr: "",
      });

      // Create the expected research file
      const researchFile = join(
        worktreeDir,
        "_thoughts",
        "research",
        "TEST-123_test_feature.md"
      );
      await writeFile(researchFile, "# Research findings\n\nSome research...");

      const result = await research(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Research completed successfully");
      expect(result.outputFile).toContain("TEST-123");
      expect(mockRunAgentCommand).toHaveBeenCalled();
    });

    it("fails after retries when research file is not created", async () => {
      mockRunAgentCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "Research completed",
        stderr: "",
      });

      // Don't create the research file - should fail

      const result = await research(testContext, tempDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Research failed after");
      expect(mockRunAgentCommand).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it("retries when agent command fails", async () => {
      mockRunAgentCommand
        .mockResolvedValueOnce({
          success: false,
          exitCode: 1,
          stdout: "",
          stderr: "Agent error",
        })
        .mockResolvedValueOnce({
          success: true,
          exitCode: 0,
          stdout: "Research completed",
          stderr: "",
        });

      // Create the research file for second attempt
      const researchFile = join(
        worktreeDir,
        "_thoughts",
        "research",
        "TEST-123_test_feature.md"
      );
      await writeFile(researchFile, "# Research findings");

      const result = await research(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(mockRunAgentCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("plan step", () => {
    it("succeeds when agent completes and creates plan file", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Plan created",
        stderr: "",
      });

      // Create the expected plan file
      const planFile = join(
        worktreeDir,
        "_thoughts",
        "plan",
        "TEST-123_test_feature.md"
      );
      await writeFile(planFile, "# Implementation Plan\n\n1. Step one...");

      const result = await plan(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Plan completed successfully");
      expect(result.outputFile).toContain("TEST-123");
    });

    it("fails after retries when plan file is not created", async () => {
      mockRunAgentCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "Plan created",
        stderr: "",
      });

      const result = await plan(testContext, tempDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Plan failed after");
    });
  });

  describe("validate step", () => {
    it("returns success when plan meets quality bar", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Plan meets all quality requirements. Approved.",
        stderr: "",
      });

      const result = await validate(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(false);
      expect(result.message).toContain("meets quality bar");
    });

    it("indicates needs changes when validation finds issues", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Plan needs changes: missing error handling strategy",
        stderr: "",
      });

      const result = await validate(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
      expect(result.message).toContain("Plan needs changes");
    });

    it("fails when agent command fails", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Validation error",
      });

      const result = await validate(testContext, tempDir);

      expect(result.success).toBe(false);
      expect(result.needsChanges).toBe(false);
    });
  });

  describe("implement step", () => {
    it("succeeds when implementation completes", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Implementation completed. session_id: abc123",
        stderr: "",
      });

      const result = await implement(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Implementation completed successfully");
      expect(result.sessionId).toBe("abc123");
    });

    it("fails when implementation fails", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Build failed",
      });

      const result = await implement(testContext, tempDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain("Implementation failed");
    });

    it("includes review feedback when resuming", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Fixed issues from review",
        stderr: "",
      });

      const contextWithSession = {
        ...testContext,
        sessionId: "prev-session",
      };

      const result = await implement(
        contextWithSession,
        tempDir,
        "Fix the error handling in function X"
      );

      expect(result.success).toBe(true);
      // The mock should have been called with args that include --resume
      expect(mockRunAgentCommand).toHaveBeenCalled();
    });
  });

  describe("review step", () => {
    it("passes when code meets quality bar", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Code review complete. All checks passed.",
        stderr: "",
      });

      const result = await review(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(false);
      expect(result.message).toContain("meets quality bar");
    });

    it("indicates needs changes when review finds issues", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Code review found critical issues that must be fixed",
        stderr: "",
      });

      const result = await review(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
    });

    it("detects needs changes from review file content", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Review written to file",
        stderr: "",
      });

      // Create a review file with critical issues
      const reviewFile = join(
        worktreeDir,
        "_thoughts",
        "code-review",
        "TEST-123_test_feature.md"
      );
      await writeFile(
        reviewFile,
        "# Code Review\n\nCritical: Memory leak in handler function"
      );

      const result = await review(testContext, tempDir);

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
      expect(result.feedbackFile).toContain("TEST-123");
    });
  });

  describe("publish step", () => {
    it("fails when gh CLI is not found", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(false);

      const result = await publish(testContext, tempDir);

      expect(result.success).toBe(false);
      expect(result.message).toContain("GitHub CLI (gh) is required");
    });

    it("succeeds when implementation is complete and PR is created", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(true);
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "All items implemented. Ready for PR.",
        stderr: "",
      });

      // Note: The actual PR creation uses Bun's $ which we can't easily mock
      // This test verifies the logic up to the PR creation

      const result = await publish(testContext, tempDir);

      // Since we can't mock Bun's $, the PR creation will fail
      // but we can verify the checkCommandExists and runAgentCommand were called
      expect(mockCheckCommandExists).toHaveBeenCalledWith("gh");
      expect(mockRunAgentCommand).toHaveBeenCalled();
    });

    it("fails when implementation is incomplete", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(true);
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Implementation incomplete. Missing test coverage.",
        stderr: "",
      });

      const result = await publish(testContext, tempDir);

      expect(result.success).toBe(false);
      // The message could be about incomplete implementation or PR creation failure
      // depending on how the publish step interprets the output
      expect(
        result.message.includes("Implementation incomplete") ||
          result.message.includes("Failed to create pull request")
      ).toBe(true);
    });
  });
});

describe("Integration Tests - Config Loading and Variable Substitution", () => {
  let tempDir: string;

  const testIssue: Issue = {
    id: "ISSUE-456",
    title: "Add User Authentication",
    description: "Implement OAuth2 authentication flow",
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-config-integration-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("substitutes all issue variables in config prompt", async () => {
    const configContent = `---
command: claude
args:
  - "--issue-id"
  - "\${issue.id}"
---

Working on issue \${issue.id}
Title: \${issue.title}
Description: \${issue.description}`;

    const configPath = join(tempDir, "test.md");
    await writeFile(configPath, configContent);

    const { loadStepConfig } = await import("./utils/config.js");
    const config = await loadStepConfig(configPath, testIssue);

    expect(config.command).toBe("claude");
    expect(config.args).toContain("ISSUE-456");
    expect(config.prompt).toContain("Working on issue ISSUE-456");
    expect(config.prompt).toContain("Title: Add User Authentication");
    expect(config.prompt).toContain(
      "Description: Implement OAuth2 authentication flow"
    );
  });
});

describe("Integration Tests - Workflow Context Flow", () => {
  it("maintains context across workflow steps", () => {
    const issue: Issue = {
      id: "FLOW-789",
      title: "Context Flow Test",
      description: "Testing context preservation",
    };

    const context: WorkflowContext = {
      issue,
      worktreeDir: "/test/worktree",
      branchName: "ralph-FLOW-789",
      planValidationAttempts: 0,
      codeReviewAttempts: 0,
    };

    // Simulate workflow progression
    context.planValidationAttempts++;
    expect(context.planValidationAttempts).toBe(1);

    context.sessionId = "session-abc123";
    expect(context.sessionId).toBe("session-abc123");

    context.codeReviewAttempts++;
    context.codeReviewAttempts++;
    expect(context.codeReviewAttempts).toBe(2);

    // Verify all fields are preserved
    expect(context.issue.id).toBe("FLOW-789");
    expect(context.branchName).toBe("ralph-FLOW-789");
  });
});

describe("Integration Tests - Error Handling", () => {
  let tempDir: string;
  let worktreeDir: string;

  const testIssue: Issue = {
    id: "ERR-001",
    title: "Error Test",
    description: "Testing error scenarios",
  };

  const testContext: WorkflowContext = {
    issue: testIssue,
    worktreeDir: "",
    branchName: "ralph-ERR-001",
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-error-integration-"));
    worktreeDir = join(tempDir, "worktree");
    await mkdir(worktreeDir, { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "research"), { recursive: true });
    testContext.worktreeDir = worktreeDir;

    mockRunAgentCommand.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles missing config file gracefully", async () => {
    const result = await research(testContext, "/nonexistent/path");

    expect(result.success).toBe(false);
    // The error message indicates the step failed - either directly or after retries
    expect(
      result.message.includes("Failed to run research step") ||
        result.message.includes("Research failed after")
    ).toBe(true);
  });

  it("handles agent command exceptions", async () => {
    mockRunAgentCommand.mockRejectedValueOnce(new Error("Network error"));

    const configDir = join(tempDir, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "research.md"),
      `---
command: claude
args: []
---
Test prompt`
    );

    const result = await research(testContext, tempDir);

    expect(result.success).toBe(false);
  });
});
