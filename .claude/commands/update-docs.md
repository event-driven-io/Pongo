---
argument-hint: "[spec-file-path]"
description: Update all project documentation after implementation work
allowed-tools: ["Read", "Write", "Edit", "MultiEdit"]
---

## System Context

Execute a sequence of documentation updates to capture lessons learned, adjust the plan, and align todo tracking after completing implementation work.

## Task Sequence

Execute these three slash commands in sequence with the provided spec file parameter:

### Step 1: Update Lessons Learned

Read and execute the prompt from @./.claude/commands/update-lessons.md with parameter: $ARGUMENTS

### Step 2: Adjust Plan

Read and execute the prompt from @./.claude/commands/adjust-plan.md with parameter: $ARGUMENTS

### Step 3: Align Todo

Read and execute the prompt from @./.claude/commands/align-todo.md with parameter: $ARGUMENTS

## Instructions

1. Read each command file to get the specific prompt to execute
2. Run each prompt in sequence with the spec file parameter
3. Validate alignment between files after each step before proceeding
4. Ensure all manual updates and custom content are preserved

## Expected Outcome

- Lessons learned captured from recent implementation work
- Plan adjusted based on discoveries to improve future flow
- Todo aligned with current plan state while preserving manual updates
