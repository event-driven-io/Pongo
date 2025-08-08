---
description: Align todo tracking with current plan state
allowed-tools: ["Read", "Edit", "MultiEdit"]
---

## System Context

Read the current plan to understand project context and current state, then align the todo file for consistency.

**Original Plan Generation Philosophy** (maintain this when adjusting):

1. Open `todo.md` and select the first unchecked items to work on.
2. Carefully plan each item, then post your plan as a comment on GitHub issue #X.
3. Create a new branch and implement your plan:
   - Write robust, well-documented code.
   - Include comprehensive tests and debug logging.
   - Verify that all tests pass.
4. Commit your changes and open a pull request referencing the issue.
5. Check off the items on todo.md"

## File Structure

- Plan file: ./plan.md (implementation steps and current state)
- Todo file: ./todo.md (progress tracking)

## Task

Read project context and current plan from ./plan.md, then align todo tracking with plan state.

**Specific prompt to execute:**

"Based on the prompt plan described in @./plan.md, please align @./todo.md with the plan:

1. **Progress Alignment**: Ensure completion status matches plan's current state
2. **Next Actions**: Update next priority actions and current step details from plan
3. **Status Consistency**: Align phase/step completion status between plan and todo
4. **Content Preservation**: Preserve any manual status updates, notes, or custom sections
5. **Format Maintenance**: Maintain existing todo format and structure

**Specific prompt to execute:**

"Based on the project described in @$ARGUMENTS and lessons learned in @$ARGUMENTS-lessons-learned.md, please align @./todo.md with the plan in ./plan.md:

**CRITICAL CONSTRAINTS:**

- YOU MUST go as close as possible with plan.
- YOU MUST NOT remove completed phases, just mark them as coompleted
- YOU MUST PRESERVE all existing prompts, phases, steps, and implementation structure
- YOU MUST NOT merge lessons learned content directly into the todo
- YOU MUST KEEP the plan as actionable prompts for future implementation
- YOU MUST not lower quality rules, e.g. by telling to run only unit tests instead of the full suite

**Default Allowed Changes (proceed without asking):**

1. **Enhance Existing Prompts**: Make step instructions clearer based on plan
2. **Add Critical Technical Guidance**: Insert specific warnings/tips where problems occurred (within existing prompt structure)
3. **Improve Command Sequences**: Update command examples based on plan

**Changes Requiring Approval (MUST ask first):**

- Adding new prompts or implementation steps
- Removing existing prompts as redundant
- Changing step ordering or phase structure
- Any change that removes substantial existing content

**Instructions:**

- Read plan first to understand context and discoveries
- Make targeted improvements to existing prompts to improve clarity and actionability
- Preserve all code examples, progress, file paths, and technical specifications
- If you identify opportunities for new prompts, redundant steps, or reordering - STOP and ask for approval
- Focus on making the todo fully aligned with the plan"
