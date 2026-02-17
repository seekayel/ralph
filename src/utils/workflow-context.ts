import type { Issue, WorkflowContext } from "../types.js";
import { issueToBranchName } from "./config.js";

export function createWorkflowContext(
  issue: Issue,
  repositoryDir: string
): WorkflowContext {
  return {
    issue,
    worktreeDir: repositoryDir,
    branchName: issueToBranchName(issue.id),
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };
}
