---
name: code-review
description: "Perform code review using the codex CLI. Reviews uncommitted changes or changes since a base branch. Triggers on: code review, review my code, review changes, codex review, review uncommitted, review branch."
---

# Code Review with Codex CLI

Performs automated code review using the `codex` CLI tool. Supports reviewing uncommitted local changes or comparing changes against a base branch.

---

## Overview

This skill uses the [codex CLI](https://github.com/openai/codex) to analyze code changes and provide feedback on:
- Code quality and best practices
- Potential bugs or issues
- Security concerns
- Suggestions for improvement

---

## Two Review Modes

### 1. Uncommitted Changes Review

Review all uncommitted changes in your working directory (staged and unstaged).

**Command:**
```bash
codex review --uncommitted
```

**Use when:**
- You want to review changes before committing
- You're doing a self-review before creating a PR
- You want quick feedback on work in progress

### 2. Branch Comparison Review

Review all changes between your current branch and a base branch (typically `main`).

**Command:**
```bash
# First, generate a diff of changes since the base branch
codex review --base "${BASE_BRANCH}"
```

**Use when:**
- You're preparing a pull request
- You want to review all work done on a feature branch
- You need a comprehensive review before merging

---

## Usage Instructions

### Step 1: Determine Review Scope

Determine the type of review.:

1. **Uncommitted changes** - Review local modifications not yet committed
2. **Branch comparison** - Review all commits on current branch vs a base branch before opening a Pull Request (PR)

### Step 2: Execute the Review

See code examples above for how to run.

### Step 3: Present Results

Summarize the codex review output for the user, highlighting:
- Critical issues that must be fixed
- Warnings that should be addressed
- Suggestions for improvement
- Overall assessment

---

## Examples

### Example 1: Review Uncommitted Changes

**User says:** "Review my uncommitted changes"

**Execute:**
```bash
codex review --uncommitted
```

**Sample output interpretation:**
```
Codex found the following issues:

CRITICAL:
- Line 45 in src/auth.js: SQL query uses string concatenation - potential SQL injection vulnerability

WARNINGS:
- Line 23 in src/utils.js: Missing null check before accessing property
- Line 89 in src/api.js: Hardcoded timeout value should be configurable

SUGGESTIONS:
- Consider adding input validation in handleSubmit function
- The error messages could be more descriptive for debugging
```

### Example 2: Review Changes Since Main Branch

**User says:** "Review my branch changes before I create a PR"

**Execute:**
```bash
# Determine base branch
BASE_BRANCH=$(git rev-parse --abbrev-ref origin/HEAD) # Almost always "main"
codex review --base ${BASE_BRANCH}
```

---

## Best Practices

1. **Run before committing**: Use uncommitted review as a pre-commit check
2. **Run before PRs**: Use branch review before creating pull requests against default in 
3. **Specify focus areas**: If you know what to look for, tell codex (e.g., "focus on security" or "check error handling")
4. **Review large changes in parts**: For very large diffs, consider reviewing file-by-file
5. **Act on critical issues**: Always address critical security or bug findings before merging

---

## Troubleshooting

### "No changes found"

- For uncommitted: Ensure you have modified files (`git status`)
- For branch comparison: Ensure your branch has commits ahead of base (`git log main..HEAD`)

### Large diffs timing out

For very large changes, review specific files:
```bash
codex --approval-mode full-auto "Review changes in src/components/"
```

---

## Checklist

Before completing the review, ensure:

- [ ] Review mode selected (uncommitted or branch comparison)
- [ ] Base branch confirmed (if doing branch comparison)
- [ ] Codex review executed successfully
- [ ] Results summarized with severity levels
- [ ] Critical issues highlighted to user
