import { describe, expect, it } from "bun:test";
import { createWorkflowContext } from "./workflow-context.js";

describe("createWorkflowContext", () => {
  it("uses repository directory directly as worktree context", () => {
    const context = createWorkflowContext(
      {
        id: "TEST-123",
        title: "Test issue",
        description: "desc",
      },
      "/tmp/repository"
    );

    expect(context.worktreeDir).toBe("/tmp/repository");
    expect(context.branchName).toBe("ralph-TEST-123");
  });
});
