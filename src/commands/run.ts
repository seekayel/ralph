import type { Issue, StepResult, WorkflowContext } from "../types.js";
import { implement } from "./implement.js";
import { plan } from "./plan.js";
import { publish } from "./publish.js";
import { research } from "./research.js";
import { getReviewFeedback, review } from "./review.js";
import { spawn } from "./spawn.js";
import { validate } from "./validate.js";

const MAX_VALIDATION_ATTEMPTS = 4;
const MAX_REVIEW_ATTEMPTS = 4;

export async function run(
  rootDir: string,
  issue: Issue,
  configDir: string
): Promise<StepResult> {
  console.log(`\n=== Starting Ralph workflow for ${issue.id} ===\n`);

  const spawnResult = await spawn(rootDir, issue);
  if (!spawnResult.success || !spawnResult.context) {
    console.error(`Spawn failed: ${spawnResult.message}`);
    return spawnResult;
  }
  console.log(`✓ Spawn: ${spawnResult.message}\n`);

  const context = spawnResult.context;

  const researchResult = await research(context, configDir);
  if (!researchResult.success) {
    console.error(`Research failed: ${researchResult.message}`);
    return researchResult;
  }
  console.log(`✓ Research: ${researchResult.message}\n`);

  let planValidated = false;
  while (!planValidated && context.planValidationAttempts < MAX_VALIDATION_ATTEMPTS) {
    const planResult = await plan(context, configDir);
    if (!planResult.success) {
      console.error(`Plan failed: ${planResult.message}`);
      return planResult;
    }
    console.log(`✓ Plan: ${planResult.message}\n`);

    const validateResult = await validate(context, configDir);
    context.planValidationAttempts++;

    if (!validateResult.success) {
      console.error(`Validate failed: ${validateResult.message}`);
      return validateResult;
    }

    if (validateResult.needsChanges) {
      console.log(
        `⟳ Validate: Plan needs changes (attempt ${context.planValidationAttempts}/${MAX_VALIDATION_ATTEMPTS})\n`
      );
      if (context.planValidationAttempts >= MAX_VALIDATION_ATTEMPTS) {
        return {
          success: false,
          message: `Plan validation failed after ${MAX_VALIDATION_ATTEMPTS} attempts`,
        };
      }
    } else {
      console.log(`✓ Validate: ${validateResult.message}\n`);
      planValidated = true;
    }
  }

  let codeReviewPassed = false;
  let reviewFeedback: string | undefined;

  while (!codeReviewPassed && context.codeReviewAttempts < MAX_REVIEW_ATTEMPTS) {
    const implementResult = await implement(context, configDir, reviewFeedback);
    if (!implementResult.success) {
      console.error(`Implement failed: ${implementResult.message}`);
      return implementResult;
    }

    if (implementResult.sessionId) {
      context.sessionId = implementResult.sessionId;
    }
    console.log(`✓ Implement: ${implementResult.message}\n`);

    const reviewResult = await review(context, configDir);
    context.codeReviewAttempts++;

    if (!reviewResult.success) {
      console.error(`Review failed: ${reviewResult.message}`);
      return reviewResult;
    }

    if (reviewResult.needsChanges) {
      console.log(
        `⟳ Review: Code needs changes (attempt ${context.codeReviewAttempts}/${MAX_REVIEW_ATTEMPTS})\n`
      );

      if (reviewResult.feedbackFile) {
        reviewFeedback = (await getReviewFeedback(reviewResult.feedbackFile)) || undefined;
      }

      if (context.codeReviewAttempts >= MAX_REVIEW_ATTEMPTS) {
        return {
          success: false,
          message: `Code review failed after ${MAX_REVIEW_ATTEMPTS} attempts`,
        };
      }
    } else {
      console.log(`✓ Review: ${reviewResult.message}\n`);
      codeReviewPassed = true;
    }
  }

  const publishResult = await publish(context, configDir);
  if (!publishResult.success) {
    console.error(`Publish failed: ${publishResult.message}`);
    return publishResult;
  }
  console.log(`✓ Publish: ${publishResult.message}\n`);

  console.log("\n=== Ralph workflow completed successfully ===\n");

  return {
    success: true,
    message: `Workflow completed: ${publishResult.message}`,
  };
}
