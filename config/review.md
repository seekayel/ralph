---
command: codex
args:
  - "--approval-mode"
  - "full-auto"
---

Use the code-review skill defined in `_agents/skills/code-review/skill.md` to review the code changes.

## Issue Details

- **ID:** ${issue.id}
- **Title:** ${issue.title}
- **Description:** ${issue.description}

## Instructions

1. Review all changes from the base branch (main)
2. Check code quality and best practices
3. Identify potential bugs or security concerns
4. Verify the implementation matches the plan
5. Write review findings to `_thoughts/code-review/${issue.id}_<topic_name>.md`

## Review Criteria

Code MEETS quality bar if:
- Implementation follows the plan
- Code follows existing patterns and conventions
- No critical bugs or security issues
- Tests adequately cover new functionality
- Code is readable and maintainable

Code NEEDS CHANGES if:
- Critical bugs or security vulnerabilities found
- Implementation deviates from plan without justification
- Missing error handling for edge cases
- Insufficient test coverage
- Code style violates project conventions

## Output

Respond with one of:
- "Code meets quality bar" - if all criteria are satisfied
- "Code needs changes: [specific issues]" - if improvements are required

Write detailed feedback to `_thoughts/code-review/${issue.id}_<topic_name>.md`
