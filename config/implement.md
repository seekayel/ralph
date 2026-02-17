---
command: claude
args:
  - "--print"
  - "--dangerously-skip-permissions"
---

Use the research-plan-implement workflow defined in `.ralph/_agents/skills/research-plan-implement/skill.md` to implement the plan.

## Issue Details

- **ID:** ${id}
- **Title:** ${title}
- **Description:** ${description}

## Instructions

1. Read the implementation plan from `_thoughts/plan/NNN_topic_name.md`
2. Implement each phase of the plan in order
3. Run lint, build, and test at consistent intervals
4. Add tests as specified in the testing strategy
5. Commit changes incrementally after each logical unit of work
6. Track progress in `_thoughts/implement/NNN_topic_name.md`
7. End your response with this exact postcondition block (use `yes` or `no` for each field):

```text
IMPLEMENT_POSTCONDITIONS
PLAN_COMPLETE: yes|no
REQUIRED_TESTS: yes|no
CHECKS_PASSING: yes|no
```

If any field is `no`, explain what remains before the block.

## Implementation Rules

- Follow the plan exactly
- If the plan needs changes, update it before proceeding
- Run `npm run lint`, `npm run build`, `npm run test` regularly
- Commit after completing each phase
- All tests must pass before considering implementation complete

## Success Criteria

- All phases of the plan are implemented
- Tests exercise the added feature
- Lint, build, and test pass
- All changes are committed
- Postcondition block reports `yes` for `PLAN_COMPLETE`, `REQUIRED_TESTS`, and `CHECKS_PASSING`
