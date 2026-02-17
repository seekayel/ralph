import type {
  Issue,
  StepAgentOverrides,
  WorkflowContext,
} from "../types.js";
import { issueToBranchName } from "./config.js";

export function createWorkflowContext(
  issue: Issue,
  repositoryDir: string,
  agentOverrides?: StepAgentOverrides
): WorkflowContext {
  return {
    issue,
    worktreeDir: repositoryDir,
    branchName: issueToBranchName(issue.id),
    agentOverrides,
    planValidationAttempts: 0,
    codeReviewAttempts: 0,
  };
}
