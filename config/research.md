---
command: claude
args:
  - "--print"
  - "--dangerously-skip-permissions"
  - "--disallowed-tools"
  - "Bash(git add:git commit:git push:git checkout:git merge:git rebase:git reset:git branch -d:git branch -D)"
---

Use the research-plan-implement workflow defined in `.ralph/_agents/skills/research-plan-implement/skill.md` to research the codebase.

## Issue Details

- **ID:** ${issue.id}
- **Title:** ${issue.title}
- **Description:** ${issue.description}

## Instructions

1. Thoroughly explore the codebase to understand the architecture and patterns
2. Identify files that will need to be modified for this issue
3. Find existing patterns for similar functionality
4. Document your findings in `_thoughts/research/${issue.id}_<topic_name>.md`

## Constraints

- Only use git read commands (status, log, diff, show, branch)
- Do not modify source code files - only write to `_thoughts/` directory
- Do not use git write commands (add, commit, push, checkout, merge)

## Success Criteria

Create a research file at `_thoughts/research/${issue.id}_<topic_name>.md` that documents:
- Architecture analysis
- Relevant code locations
- Existing patterns to follow
- Dependencies and considerations
