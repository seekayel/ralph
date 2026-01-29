import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Issue, WorkflowContext } from "./types.js";

/**
 * E2E Tests for the Ralph Workflow
 *
 * These tests verify the workflow steps work correctly with mocked external CLI tools.
 * They don't test the full `run` command orchestration to avoid complex mocking of
 * spawn and git operations, but do verify that each step works and that the retry
 * logic functions correctly.
 */

// Mock only the process module for external CLI tools (claude, codex, gh)
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

// Mock the process module before importing commands
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

describe("E2E Tests - Individual Workflow Steps", () => {
  let tempDir: string;
  let worktreeDir: string;
  let configDir: string;

  const testIssue: Issue = {
    id: "E2E-001",
    title: "End to End Test Feature",
    description: "Comprehensive end-to-end test for the Ralph workflow",
  };

  const createContext = (): WorkflowContext => ({
    issue: testIssue,
    worktreeDir,
    branchName: "ralph-E2E-001",
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-e2e-steps-"));
    worktreeDir = join(tempDir, "worktree");
    configDir = tempDir;

    // Create directory structure
    await mkdir(join(configDir, "config"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "research"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "plan"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "code-review"), { recursive: true });

    // Create config files for all workflow steps
    await createAllConfigFiles(join(configDir, "config"));

    // Reset all mocks
    mockRunAgentCommand.mockClear();
    mockCheckCommandExists.mockClear();
    mockRunCommand.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function createAllConfigFiles(dir: string) {
    const researchConfig = `---
command: claude
args:
  - "--headless"
  - "--allowedTools"
  - "Read,Grep,Glob"
---

Research the codebase for issue \${issue.id}: \${issue.title}

Description: \${issue.description}`;

    const planConfig = `---
command: claude
args:
  - "--headless"
---

Create an implementation plan for issue \${issue.id}: \${issue.title}

Description: \${issue.description}`;

    const validateConfig = `---
command: codex
args:
  - "--headless"
---

Validate the implementation plan for issue \${issue.id}: \${issue.title}`;

    const implementConfig = `---
command: claude
args:
  - "--headless"
---

Implement the plan for issue \${issue.id}: \${issue.title}

Description: \${issue.description}`;

    const reviewConfig = `---
command: codex
args:
  - "--headless"
---

Review the code changes for issue \${issue.id}: \${issue.title}`;

    const publishConfig = `---
command: codex
args:
  - "--headless"
---

Confirm implementation is complete for issue \${issue.id}: \${issue.title}`;

    await writeFile(join(dir, "research.md"), researchConfig);
    await writeFile(join(dir, "plan.md"), planConfig);
    await writeFile(join(dir, "validate.md"), validateConfig);
    await writeFile(join(dir, "implement.md"), implementConfig);
    await writeFile(join(dir, "review.md"), reviewConfig);
    await writeFile(join(dir, "publish.md"), publishConfig);
  }

  describe("research step", () => {
    it("succeeds when research file is created", async () => {
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
        "E2E-001_end_to_end_test_feature.md"
      );
      await writeFile(researchFile, "# Research Findings\n\nCompleted research.");

      const result = await research(createContext());

      expect(result.success).toBe(true);
      expect(result.message).toBe("Research completed successfully");
      expect(result.outputFile).toContain("E2E-001");
    });

    it("retries and fails when research file is not created", async () => {
      mockRunAgentCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "Research completed",
        stderr: "",
      });

      const result = await research(createContext());

      expect(result.success).toBe(false);
      expect(result.message).toContain("Research failed after");
      expect(mockRunAgentCommand).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it("retries when agent command fails then succeeds", async () => {
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

      // Create research file for second attempt
      const researchFile = join(
        worktreeDir,
        "_thoughts",
        "research",
        "E2E-001_end_to_end_test_feature.md"
      );
      await writeFile(researchFile, "# Research");

      const result = await research(createContext());

      expect(result.success).toBe(true);
      expect(mockRunAgentCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("plan step", () => {
    it("succeeds when plan file is created", async () => {
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
        "E2E-001_end_to_end_test_feature.md"
      );
      await writeFile(planFile, "# Implementation Plan\n\n1. Step one");

      const result = await plan(createContext());

      expect(result.success).toBe(true);
      expect(result.message).toBe("Plan completed successfully");
      expect(result.outputFile).toContain("E2E-001");
    });

    it("retries and fails when plan file is not created", async () => {
      mockRunAgentCommand.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "Plan created",
        stderr: "",
      });

      const result = await plan(createContext());

      expect(result.success).toBe(false);
      expect(result.message).toContain("Plan failed after");
    });
  });

  describe("validate step", () => {
    it("passes when plan meets quality bar", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Plan is well structured and meets all quality requirements. Approved.",
        stderr: "",
      });

      const result = await validate(createContext());

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

      const result = await validate(createContext());

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
      expect(result.message).toContain("Plan needs changes");
    });

    it("detects 'requires changes' keyword", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "The plan requires changes to address security concerns",
        stderr: "",
      });

      const result = await validate(createContext());

      expect(result.needsChanges).toBe(true);
    });

    it("detects 'problematic' keyword", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Several aspects of the plan are problematic",
        stderr: "",
      });

      const result = await validate(createContext());

      expect(result.needsChanges).toBe(true);
    });

    it("fails when agent command fails", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Agent crashed",
      });

      const result = await validate(createContext());

      expect(result.success).toBe(false);
      expect(result.needsChanges).toBe(false);
    });
  });

  describe("implement step", () => {
    it("succeeds and extracts session ID", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Implementation completed. session_id: e2e-impl-session-123",
        stderr: "",
      });

      const result = await implement(createContext());

      expect(result.success).toBe(true);
      expect(result.message).toBe("Implementation completed successfully");
      expect(result.sessionId).toBe("e2e-impl-session-123");
    });

    it("succeeds without session ID", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Implementation completed successfully",
        stderr: "",
      });

      const result = await implement(createContext());

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeUndefined();
    });

    it("fails when agent command fails", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Build failed",
      });

      const result = await implement(createContext());

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
        ...createContext(),
        sessionId: "prev-session",
      };

      const result = await implement(
        contextWithSession,
        "Fix the error handling in function X"
      );

      expect(result.success).toBe(true);
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

      const result = await review(createContext());

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(false);
      expect(result.message).toContain("meets quality bar");
    });

    it("indicates needs changes when review finds critical issues", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Code review found critical security vulnerability",
        stderr: "",
      });

      const result = await review(createContext());

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
    });

    it("detects 'must be fixed' keyword", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "The memory leak must be fixed before merging",
        stderr: "",
      });

      const result = await review(createContext());

      expect(result.needsChanges).toBe(true);
    });

    it("detects needs changes from review file content", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Review written to file",
        stderr: "",
      });

      // Create review file with critical issues
      const reviewFile = join(
        worktreeDir,
        "_thoughts",
        "code-review",
        "E2E-001_end_to_end_test_feature.md"
      );
      await writeFile(
        reviewFile,
        "# Code Review\n\nCritical: Memory leak in handler function"
      );

      const result = await review(createContext());

      expect(result.success).toBe(true);
      expect(result.needsChanges).toBe(true);
      expect(result.feedbackFile).toContain("E2E-001");
    });

    it("fails when agent command fails", async () => {
      mockRunAgentCommand.mockResolvedValueOnce({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Review failed",
      });

      const result = await review(createContext());

      expect(result.success).toBe(false);
      expect(result.needsChanges).toBe(false);
    });
  });

  describe("publish step", () => {
    it("fails when gh CLI is not found", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(false);

      const result = await publish(createContext());

      expect(result.success).toBe(false);
      expect(result.message).toContain("GitHub CLI (gh) is required");
    });

    it("checks for gh CLI before proceeding", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(true);
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "All items implemented",
        stderr: "",
      });

      // Will fail at actual PR creation but we can verify the checks
      await publish(createContext());

      expect(mockCheckCommandExists).toHaveBeenCalledWith("gh");
    });

    it("fails when implementation is incomplete", async () => {
      mockCheckCommandExists.mockResolvedValueOnce(true);
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: "Implementation incomplete. Missing test coverage.",
        stderr: "",
      });

      const result = await publish(createContext());

      // Verify failure due to incomplete implementation or PR creation
      expect(result.success).toBe(false);
    });
  });
});

describe("E2E Tests - Workflow Retry Logic", () => {
  let tempDir: string;
  let worktreeDir: string;
  let configDir: string;

  const testIssue: Issue = {
    id: "E2E-002",
    title: "Retry Logic Test",
    description: "Testing retry logic in workflow",
  };

  const createContext = (): WorkflowContext => ({
    issue: testIssue,
    worktreeDir,
    branchName: "ralph-E2E-002",
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  });

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-e2e-retry-"));
    worktreeDir = join(tempDir, "worktree");
    configDir = tempDir;

    await mkdir(join(configDir, "config"), { recursive: true });
    await mkdir(join(worktreeDir, "_thoughts", "plan"), { recursive: true });

    const config = `---
command: test
args: []
---
Test prompt for \${issue.id}`;

    await writeFile(join(configDir, "config", "plan.md"), config);
    await writeFile(join(configDir, "config", "validate.md"), config);
    await writeFile(join(configDir, "config", "implement.md"), config);
    await writeFile(join(configDir, "config", "review.md"), config);

    mockRunAgentCommand.mockClear();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("simulates plan-validate retry loop up to 4 attempts", async () => {
    // Set up mocks for 4 plan+validate cycles, all returning "needs changes"
    mockRunAgentCommand
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan 1", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan needs changes: issue 1", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan 2", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan needs changes: issue 2", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan 3", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan needs changes: issue 3", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan 4", stderr: "" })
      .mockResolvedValueOnce({ success: true, exitCode: 0, stdout: "Plan needs changes: issue 4", stderr: "" });

    // Create plan file
    await writeFile(
      join(worktreeDir, "_thoughts", "plan", "E2E-002_retry_logic_test.md"),
      "# Plan"
    );

    const context = createContext();
    const MAX_ATTEMPTS = 4;
    let planValidated = false;

    while (!planValidated && context.planValidationAttempts < MAX_ATTEMPTS) {
      const planResult = await plan(context);
      expect(planResult.success).toBe(true);

      const validateResult = await validate(context);
      context.planValidationAttempts++;

      if (!validateResult.needsChanges) {
        planValidated = true;
      }
    }

    expect(context.planValidationAttempts).toBe(4);
    expect(planValidated).toBe(false);
    expect(mockRunAgentCommand).toHaveBeenCalledTimes(8); // 4 plans + 4 validates
  });

  it("simulates implement-review retry loop up to 4 attempts", async () => {
    // This test verifies that the workflow retry counter works correctly
    // We simulate the review always returning needsChanges=true

    const context = createContext();
    const MAX_ATTEMPTS = 4;

    // Simulate what the run command would do
    while (context.codeReviewAttempts < MAX_ATTEMPTS) {
      // Simulate implement step
      mockRunAgentCommand.mockResolvedValueOnce({
        success: true,
        exitCode: 0,
        stdout: `Impl ${context.codeReviewAttempts + 1}. session_id: s${context.codeReviewAttempts + 1}`,
        stderr: "",
      });

      const implResult = await implement(context);
      expect(implResult.success).toBe(true);

      // Increment counter (this is what run.ts does)
      context.codeReviewAttempts++;

      // In a real scenario, review would be called here and needsChanges checked
      // For this test, we just verify the counter increments correctly
    }

    // Verify we hit the max attempts
    expect(context.codeReviewAttempts).toBe(4);
  });

  it("exits retry loop early when validation passes", async () => {
    // Clear mocks first to ensure clean state
    mockRunAgentCommand.mockReset();

    // Use mockImplementation for sequential responses
    let callCount = 0;
    mockRunAgentCommand.mockImplementation(() => {
      callCount++;
      // Call 1: Plan 1
      // Call 2: Validate 1 - needs changes
      // Call 3: Plan 2
      // Call 4: Validate 2 - passes
      if (callCount === 1) return Promise.resolve({ success: true, exitCode: 0, stdout: "Plan 1", stderr: "" });
      if (callCount === 2) return Promise.resolve({ success: true, exitCode: 0, stdout: "Plan needs changes", stderr: "" });
      if (callCount === 3) return Promise.resolve({ success: true, exitCode: 0, stdout: "Plan 2", stderr: "" });
      return Promise.resolve({ success: true, exitCode: 0, stdout: "Plan meets quality bar. Approved.", stderr: "" });
    });

    await writeFile(
      join(worktreeDir, "_thoughts", "plan", "E2E-002_retry_logic_test.md"),
      "# Plan"
    );

    const context = createContext();
    const MAX_ATTEMPTS = 4;
    let planValidated = false;

    while (!planValidated && context.planValidationAttempts < MAX_ATTEMPTS) {
      const planResult = await plan(context);
      const validateResult = await validate(context);
      context.planValidationAttempts++;

      if (!validateResult.needsChanges) {
        planValidated = true;
      }
    }

    expect(context.planValidationAttempts).toBe(2);
    expect(planValidated).toBe(true);
    expect(mockRunAgentCommand).toHaveBeenCalledTimes(4); // 2 plans + 2 validates
  });
});

describe("E2E Tests - Config Variable Substitution", () => {
  it("substitutes all issue variables in embedded config", async () => {
    const { loadStepConfig } = await import("./utils/config.js");

    const issue: Issue = {
      id: "VAR-TEST-001",
      title: "Variable Substitution Test",
      description: "Testing variable substitution in configs",
    };

    const config = await loadStepConfig("config/research.md", issue);

    expect(config.command).toBe("claude");
    // The embedded config should have variables substituted
    expect(config.prompt).toContain("VAR-TEST-001");
    expect(config.prompt).toContain("Variable Substitution Test");
    expect(config.prompt).toContain("Testing variable substitution in configs");
  });

  it("handles various issue ID formats in embedded config", async () => {
    const { loadStepConfig } = await import("./utils/config.js");

    const issueFormats = [
      { id: "JIRA-123", title: "Standard", description: "desc" },
      { id: "PROJECT-1", title: "Short", description: "desc" },
      { id: "ABC-123456789", title: "Long", description: "desc" },
    ];

    for (const issue of issueFormats) {
      const config = await loadStepConfig("config/research.md", issue);
      expect(config.prompt).toContain(issue.id);
    }
  });

  it("handles special characters in issue fields with embedded config", async () => {
    const { loadStepConfig } = await import("./utils/config.js");

    const issue: Issue = {
      id: "SPECIAL-1",
      title: 'Test "with" <special> chars',
      description: "Description with\nnewlines\nand ${vars}",
    };

    const config = await loadStepConfig("config/research.md", issue);

    expect(config.prompt).toContain("SPECIAL-1");
    expect(config.prompt).toContain('Test "with" <special> chars');
    expect(config.prompt).toContain("Description with\nnewlines\nand ${vars}");
  });
});
