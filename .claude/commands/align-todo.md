---
argument-hint: "[spec-file-path]"
description: Align todo tracking with current plan state
allowed-tools: ["Read", "Edit", "MultiEdit"]
---

## System Context
Read the spec file and current plan to understand project context and current state, then align the todo file for consistency.

## File Structure
- Spec file: $ARGUMENTS (contains project context and status)
- Plan file: ./plan.md (implementation steps and current state)
- Todo file: ./todo.md (progress tracking)

## Task
Read project context and current plan, then align todo tracking with plan state.

**Specific prompt to execute:**

"Based on the project described in @$ARGUMENTS and current state in @./plan.md, please align @./todo.md with the plan:

1. **Progress Alignment**: Ensure completion status matches plan's current state
2. **Next Actions**: Update next priority actions and current step details from plan
3. **Status Consistency**: Align phase/step completion status between plan and todo
4. **Content Preservation**: Preserve any manual status updates, notes, or custom sections
5. **Format Maintenance**: Maintain existing todo format and structure

**Instructions:**
- Read spec and plan files first to understand context and current state
- Adjust for alignment while keeping manual updates intact
- Don't lose custom content or manual annotations
- Ensure todo accurately reflects what's shown as current in plan
- Update next actions to match plan's current priority
- Preserve todo structure and formatting while ensuring consistency

**Validation**: After alignment, check that plan and todo show consistent current status and next actions."