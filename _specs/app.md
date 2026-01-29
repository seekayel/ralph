This application is a CLI tool called Ralph. It is built and bundled using Bun 1.3.6 or higher. It runs a sequence of operations when invoked. It is invoked with a JSON payload that contains an issue ID, an issue title, and an issue description. It is invoked in a directory that contains subfolders for each of the git work trees of the relevant repository. The CLI, if invoked with `run`, will run all steps in the ralph-cli workflow. Otherwise, each of the individual steps can be run with `ralph` and then the name of the step. For example, `ralph spawn`, `ralph research`, or `ralph plan`. The @README.md    of this repo should contain all information needed by a human to be able to check out, install, build, and run any associated tests on this repository. There should be example execution commands for the Ralph workflow. Each CLI action should have an associated --help flag, which prints all relevant command flags and arguments that are possible.

# General Guidance

**Prompts**
Template prompts should be stored in `src/prompts`

**Error Handling**
If the CLI is invoked in a directory that is not a Git work tree bare root directory, it should print an error message saying such and exit.


# CLI

The cli takes a JSON payload either via standard input or from a file via a command-line flag and argument. The command used to invoke each action (the agent, the flags and prompt file) should all be stored in config files that the core code runs. We expect that which agent is run on which step will change in the future.


## Run
The Run action takes a JSON payload either via standard input or from a file via a command-line flag and argument. It then implements the full Ralph CLI workflow using that JSON payload.


## Full CLI Workflow
1. Spawn
2. Research
3. Plan
4. Validate
5. Implement
6. Review
7. Publish


## Spawn

**Action**
Create a new git worktree and branch based on the issue ID. For example `HLN-14` becomes `ralph-HLN-14`. `cd` into the new worktree directory. Read the README.md for install, build and test commands.

**Success Criteria**
Only proceed if the tests complete successfully. Otherwise print an error message and exit with failing exit code.


## Research

**Action**
Invoke a claude code session headless with a prompt to use the research-plan-implement workflow in `_agents/skills/research-plan-implement` to research the code base in relation to the requested issue. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).

**Success Criteria**
Only proceed if the claude code session successfully generates a `_thoughts/research/NNN_topic_name.md` file. Otherwise retry once, if fails a second time then print error message and exit with a failure.


## Plan

**Action**
Invoke a claude code session headless with a prompt to use the research-plan-implement workflow in `_agents/skills/research-plan-implement` to plan an implementation and testing plan for the the code base in relation to the requested issue using the `_thoughts/research/NNN_topic_name.md` research. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).

**Success Criteria**
Only proceed if the claude code session successfully generates a `_thoughts/plan/NNN_topic_name.md` file. Otherwise retry once, if fails a second time then print error message and exit with a failure.


## Validate

**Action**
Invoke a codex session headless with a prompt to use the plan file checking that it specifies a plan that will implement the feature requested and defines a testing plan that will ensure the plan is implemented and that the implemented code works.

**Success Criteria**
Output either that the plan meets our quality bar or highlight the specific parts of the plan that are problematic and why. If there are changes needed to the plan then go back and invoke the Plan stage if run in full work flow `run` mode, if in single `validate` mode then exit with message as to outcome. If the  validate requests changes a 4th time then instead of invoking the Plan step, instead print error messaging and exit.


## Implement

**Action**
Invoke a claude code session headless with a prompt to use the research-plan-implement workflow in `_agents/skills/research-plan-implement` to implement the plan as detailed in `_thoughts/plan/NNN_topic_name.md` based on the research in `_thoughts/plan/NNN_topic_name.md`. Save the session id either in a local variable or temp file, for use in resuming a session if the code review step requires changes. Incremental commits are acceptable. The agent should run lint, build and test at consistent intervals. Tests that cover the feature being added should be added as per the testing plan in the plan file.

If the code review step invokes this step then provide the code review feedback file to the resumed claude code session along with instructions that the highlighted issues need to be resolved.

**Success Criteria**
There are tests that exercise the added feature. The added feature has been written in code as per the plan. All steps of the plan were implemented. There are no remaining actions or tasks. Commit any local changes.


## Review

**Action**
Invoke a codex session headless with a prompt to use the code-review skill in `_agents/skills/code-review` do a code review of changes from the base branch (main). Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc). Ask for the review to be written to `_thoughts/code-review/NNN_topic_name.md` and structure output returned with if the code met quality bar.

**Success Criteria**
Output either that the code changes meet our quality bar or highlight the specific parts of the code that are problematic and why. If there are changes needed then go back and invoke the Implement stage if run in full work flow `run` mode, if in single `review` mode then exit with message as to outcome. If the code review requests changes a 4th time then instead of invoking the implement step, instead print error messaging and exit.


## Publish

**Action**
Invoke a codex session headless with a prompt to confirm that the changes on the current branch implement all the parts of the plan file, that no items were left incomplete and that all tests were written. Allow git read commands (status, diff, log, etc) but no git edits (add, commit, merge, push, checkout etc).


**Success Criteria**
If everything was implemented then use the gh cli tool to create a pull requests from the local branch. Otherwise print error message and exit.
