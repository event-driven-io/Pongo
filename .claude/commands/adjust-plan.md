---
argument-hint: "[spec-file-path]"
description: Adjust implementation plan based on lessons learned
allowed-tools: ["Read", "Edit", "MultiEdit"]
---

## System Context
Read the spec file and lessons learned to understand project context and discoveries, then adjust the plan to improve future implementation flow.

## File Structure
- Spec file: $ARGUMENTS (contains project context)
- Lessons file: $ARGUMENTS-lessons-learned.md (implementation discoveries)
- Plan file: ./plan.md (implementation steps and prompts)

## Task
Read project context and lessons learned, then adjust the plan for smoother future execution.

**Specific prompt to execute:**

"Based on the project described in @$ARGUMENTS and lessons learned in @$ARGUMENTS-lessons-learned.md, please adjust @./plan.md to improve future implementation flow:

1. **Step Clarity**: Make implementation steps more fluent and clear based on actual experience
2. **Critical Path Integration**: Incorporate sequencing insights to reduce back-and-forth
3. **Issue Clarifications**: Add clarifications where problems were encountered during implementation
4. **Flow Optimization**: Adjust step ordering if lessons suggest better implementation flow
5. **Experience Integration**: Improve step descriptions based on what actually worked

**Instructions:**
- Read spec and lessons files first to understand context and discoveries
- Only make adjustments to improve clarity and flow - do NOT rewrite entirely
- Preserve overall structure and format
- If major rewrite seems needed, ask for confirmation first
- Focus on making future runs smoother based on real implementation experience
- Add specific technical guidance where issues were encountered"