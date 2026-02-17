import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkflowContext } from "../types.js";

const mockLoadStepConfig = mock(() =>
  Promise.resolve({
    command: "claude",
    args: ["--print"],
    prompt: "implement prompt",
  })
);
const mockSyncAgentsToWorktree = mock(() => Promise.resolve());
const mockRunAgentCommand = mock(() =>
  Promise.resolve({
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
  })
);
const mockLoadSessionId = mock(() => Promise.resolve(undefined));
const mockSaveSessionId = mock(() => Promise.resolve());
const mockDebug = mock(() => {});

mock.module("../utils/config.js", () => ({
  loadStepConfig: mockLoadStepConfig,
}));

mock.module("../utils/paths.js", () => ({
  syncAgentsToWorktree: mockSyncAgentsToWorktree,
}));

mock.module("../utils/process.js", () => ({
  runAgentCommand: mockRunAgentCommand,
}));

mock.module("../utils/session.js", () => ({
  loadSessionId: mockLoadSessionId,
  saveSessionId: mockSaveSessionId,
}));

mock.module("../utils/logger.js", () => ({
  debug: mockDebug,
}));

import { checkImplementPostconditions, implement } from "./implement.js";

describe("checkImplementPostconditions", () => {
  it("passes only when all required postconditions are explicitly satisfied", () => {
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
CHECKS_PASSING: yes
`)
    ).toBe(true);
  });

  it("fails closed for ambiguous or incomplete output", () => {
    expect(
      checkImplementPostconditions(
        "Implemented most tasks and ran some tests successfully."
      )
    ).toBe(false);
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
`)
    ).toBe(false);
  });

  it("fails when any postcondition is explicitly negative", () => {
    expect(
      checkImplementPostconditions(`
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: no
CHECKS_PASSING: yes
`)
    ).toBe(false);
  });
});

describe("implement", () => {
  let worktreeDir: string;
  let context: WorkflowContext;

  beforeEach(async () => {
    worktreeDir = await mkdtemp(join(tmpdir(), "ralph-implement-test-"));
    context = {
      issue: {
        id: "IMP-10",
        title: "Implement postconditions",
        description: "Verify postcondition gating",
      },
      worktreeDir,
      branchName: "ralph-imp-10",
      planValidationAttempts: 0,
      codeReviewAttempts: 0,
    };

    mockLoadStepConfig.mockClear();
    mockSyncAgentsToWorktree.mockClear();
    mockRunAgentCommand.mockClear();
    mockLoadSessionId.mockClear();
    mockSaveSessionId.mockClear();
    mockDebug.mockClear();
  });

  afterEach(async () => {
    await rm(worktreeDir, { recursive: true, force: true });
  });

  it("fails when process exits successfully but postconditions are not fully satisfied", async () => {
    mockRunAgentCommand.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: `
session_id: sess-123
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
`,
      stderr: "",
    });

    const result = await implement(context);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Implementation postconditions not met");
    expect(result.message).toContain("passing checks");
    expect(result.sessionId).toBe("sess-123");
  });

  it("succeeds only when all required postconditions are explicitly satisfied", async () => {
    mockRunAgentCommand.mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: `
session_id: sess-456
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes
REQUIRED_TESTS: yes
CHECKS_PASSING: yes
`,
      stderr: "",
    });

    const result = await implement(context);

    expect(result.success).toBe(true);
    expect(result.message).toBe("Implementation completed successfully");
    expect(result.sessionId).toBe("sess-456");
    expect(mockSaveSessionId).toHaveBeenCalledWith(worktreeDir, "sess-456");
  });
});
