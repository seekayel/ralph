---
command: codex
args:
  - "exec"
  - "--full-auto"
  - "--sandbox"
  - "read-only"
---

Review and validate the implementation plan for quality and completeness.

## Issue Details

- **ID:** ${issue.id}
- **Title:** ${issue.title}
- **Description:** ${issue.description}

## Instructions

1. Read the plan from `_thoughts/plan/${issue.id}_*.md`
2. Verify the plan will implement the feature described in the issue
3. Check that the testing strategy will adequately verify the implementation
4. Assess if success criteria are clear and testable

## Validation Criteria

The plan MEETS quality bar if:
- All aspects of the issue are addressed
- Implementation phases are logically ordered
- Success criteria are specific and testable
- Testing strategy covers the feature requirements
- Rollback plan is defined

The plan NEEDS CHANGES if:
- Key requirements from the issue are missing
- Implementation steps are incomplete or unclear
- Testing strategy is insufficient
- Success criteria are vague or untestable

## Output

Respond with one of:
- "Plan meets quality bar" - if all criteria are satisfied
- "Plan needs changes: [specific issues]" - if improvements are required
