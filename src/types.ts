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

export interface WorkflowContext {
  issue: Issue;
  worktreeDir: string;
  branchName: string;
  sessionId?: string;
  planValidationAttempts: number;
  codeReviewAttempts: number;
}

export interface StepResult {
  success: boolean;
  message: string;
  outputFile?: string;
  sessionId?: string;
}
