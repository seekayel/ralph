export interface Issue {
  id: string;
  title: string;
  description: string;
}

export interface StepConfig {
  command: string;
  args: string[];
  prompt: string;
}

export type WorkflowStepName =
  | "research"
  | "plan"
  | "validate"
  | "implement"
  | "review"
  | "publish";

export type StepAgentOverrides = Partial<Record<WorkflowStepName, string>>;

export interface WorkflowContext {
  issue: Issue;
  worktreeDir: string;
  branchName: string;
  sessionId?: string;
  agentOverrides?: StepAgentOverrides;
  planValidationAttempts: number;
  codeReviewAttempts: number;
}

export interface StepResult {
  success: boolean;
  message: string;
  outputFile?: string;
  sessionId?: string;
  debugArtifactDir?: string;
}
