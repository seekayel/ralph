import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Issue, WorkflowContext } from "../types.js";

const callOrder: string[] = [];

const mockAcquireLock = mock(() =>
  Promise.resolve({
    acquired: true,
    existingLock: undefined,
  })
);
const mockReleaseLock = mock(() => Promise.resolve());

const mockSpawn = mock(() =>
  Promise.resolve({
    success: true,
    message: "spawned",
  })
);

const mockResearch = mock((_: WorkflowContext) => {
  callOrder.push("research");
  return Promise.resolve({ success: true, message: "research ok" });
});

const mockPlan = mock((_: WorkflowContext) => {
  callOrder.push("plan");
  return Promise.resolve({ success: true, message: "plan ok" });
});

const mockValidate = mock((_: WorkflowContext) => {
  callOrder.push("validate");
  return Promise.resolve({
    success: true,
    needsChanges: false,
    message: "validate ok",
  });
});

const mockImplement = mock((_: WorkflowContext) => {
  callOrder.push("implement");
  return Promise.resolve({ success: true, message: "implement ok" });
});

const mockReview = mock((_: WorkflowContext) => {
  callOrder.push("review");
  return Promise.resolve({
    success: true,
    needsChanges: false,
    message: "review ok",
  });
});

const mockPublish = mock((_: WorkflowContext) => {
  callOrder.push("publish");
  return Promise.resolve({ success: true, message: "publish ok" });
});

const mockGetReviewFeedback = mock(() => Promise.resolve("feedback"));

async function importRunWithMocks() {
  mock.module("../utils/lock.js", () => ({
    acquireLock: mockAcquireLock,
    releaseLock: mockReleaseLock,
  }));

  mock.module("./spawn.js", () => ({
    spawn: mockSpawn,
    getCommandTimeout: () => {
      const envTimeout = process.env.RALPH_COMMAND_TIMEOUT_MS;
      if (envTimeout) {
        const parsed = Number.parseInt(envTimeout, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return 300000;
    },
  }));

  mock.module("./research.js", () => ({
    research: mockResearch,
  }));

  mock.module("./plan.js", () => ({
    plan: mockPlan,
  }));

  mock.module("./validate.js", () => ({
    validate: mockValidate,
  }));

  mock.module("./implement.js", () => ({
    implement: mockImplement,
  }));

  mock.module("./review.js", () => ({
    review: mockReview,
    getReviewFeedback: mockGetReviewFeedback,
  }));

  mock.module("./publish.js", () => ({
    publish: mockPublish,
  }));

  const { run } = await import(`./run.js?test=${Date.now()}-${Math.random()}`);
  return run;
}

describe("run workflow", () => {
  const issue: Issue = {
    id: "RUN-123",
    title: "Run workflow",
    description: "Ensure workflow order is spec compliant",
  };

  beforeEach(() => {
    callOrder.length = 0;
    mockAcquireLock.mockClear();
    mockReleaseLock.mockClear();
    mockSpawn.mockClear();
    mockResearch.mockClear();
    mockPlan.mockClear();
    mockValidate.mockClear();
    mockImplement.mockClear();
    mockReview.mockClear();
    mockPublish.mockClear();
    mockGetReviewFeedback.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  it("runs research->plan->validate->implement->review->publish without spawn", async () => {
    const run = await importRunWithMocks();
    const result = await run("/tmp/repo", issue);

    expect(result.success).toBe(true);
    expect(callOrder).toEqual([
      "research",
      "plan",
      "validate",
      "implement",
      "review",
      "publish",
    ]);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockReleaseLock).toHaveBeenCalledWith("/tmp/repo");
  });

  it("propagates per-step agent overrides through workflow context", async () => {
    const run = await importRunWithMocks();
    const overrides = {
      research: "codex",
      plan: "codex",
      validate: "codex",
      implement: "claude",
      review: "codex",
      publish: "codex",
    } as const;

    const result = await run("/tmp/repo", issue, { agentOverrides: overrides });

    expect(result.success).toBe(true);
    expect(mockResearch).toHaveBeenCalledWith(
      expect.objectContaining({ agentOverrides: overrides })
    );
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ agentOverrides: overrides })
    );
  });
});
