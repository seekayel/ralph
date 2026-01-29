---
command: codex
args:
  - "--approval-mode"
  - "full-auto"
---

Verify implementation completeness before creating a pull request.

## Issue Details

- **ID:** ${issue.id}
- **Title:** ${issue.title}
- **Description:** ${issue.description}

## Instructions

1. Read the implementation plan from `_thoughts/plan/${issue.id}_*.md`
2. Verify all plan items have been implemented
3. Confirm all tests were written and are passing
4. Check that no items are left incomplete

## Verification Criteria

Implementation is COMPLETE if:
- All phases from the plan are marked complete
- All success criteria from the plan are met
- All tests specified in the testing strategy exist
- Lint, build, and test commands pass

Implementation is INCOMPLETE if:
- Any plan item is not implemented
- Tests are missing for specified functionality
- Build or tests are failing

## Output

Respond with one of:
- "All items implemented - ready for PR" - if complete
- "Implementation incomplete: [missing items]" - if work remains
