---
command: claude
args:
  - "--headless"
  - "--allowedTools"
  - "Read,Grep,Glob,Bash(git status:git log:git diff:git show:git branch)"
---

Use the research-plan-implement workflow defined in `.ralph/_agents/skills/research-plan-implement/skill.md` to create an implementation plan.

## Issue Details

- **ID:** ${issue.id}
- **Title:** ${issue.title}
- **Description:** ${issue.description}

## Instructions

1. Read the research findings from `_thoughts/research/${issue.id}_*.md`
2. Create a detailed implementation plan
3. Define testing strategy
4. Document the plan in `_thoughts/plan/${issue.id}_<topic_name>.md`

## Constraints

- Only use git read commands (status, log, diff, show, branch)
- Do not make any changes to the codebase
- Do not use git write commands (add, commit, push, checkout, merge)

## Success Criteria

Create a plan file at `_thoughts/plan/${issue.id}_<topic_name>.md` that includes:
- Overview of the implementation
- Phased approach with files to modify
- Success criteria for each phase
- Testing strategy
- Rollback plan
