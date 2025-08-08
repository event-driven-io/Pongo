---
argument-hint: "[spec-file-path]"
description: Adjust implementation plan based on lessons learned
allowed-tools: ["Read", "Edit", "MultiEdit"]
---

## System Context

Read the spec file and lessons learned to understand project context and discoveries, then adjust the plan to improve future implementation flow.

**Original Plan Generation Philosophy** (maintain this when adjusting):
The plan was originally generated using this approach: "Draft a detailed, step-by-step blueprint for building this project. Then, once you have a solid plan, break it down into small, iterative chunks that build on each other. Look at these chunks and then go another round to break it into small steps. Review the results and make sure that the steps are small enough to be implemented safely with strong testing, but big enough to move the project forward. Iterate until you feel that the steps are right sized for this project. From here you should have the foundation to provide a series of prompts for a code-generation LLM that will implement each step in a test-driven manner. Prioritize best practices, incremental progress, and early testing, ensuring no big jumps in complexity at any stage. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step."

## File Structure

- Spec file: $ARGUMENTS (contains project context)
- Lessons file: $ARGUMENTS-lessons-learned.md (implementation discoveries)
- Plan file: ./plan.md (implementation steps and prompts)

## Task

Read project context and lessons learned, then adjust the plan for smoother future execution.

**Specific prompt to execute:**

"Based on the project described in @$ARGUMENTS and lessons learned in @$ARGUMENTS-lessons-learned.md, please adjust @./plan.md to improve future implementation flow:

**CRITICAL CONSTRAINTS:**

- YOU MUST PRESERVE all existing prompts, phases, steps, and implementation structure
- YOU MUST NOT add progress tracking, status indicators, or completion markers, or explicit learning from implementations
- YOU MUST NOT merge lessons learned content directly into the plan
- YOU MUST KEEP the plan as actionable prompts for future implementation
- YOU MUST not lower quality rules, e.g. by telling to run only unit tests instead of the full suite

**Default Allowed Changes (proceed without asking):**

1. **Enhance Existing Prompts**: Make step instructions clearer based on what actually worked
2. **Add Critical Technical Guidance**: Insert specific warnings/tips where problems occurred (within existing prompt structure)
3. **Improve Command Sequences**: Update command examples based on what worked
4. **Clarify Tricky Steps**: Add specific technical details where implementation was complex

**Changes Requiring Approval (MUST ask first):**

- Adding new prompts or implementation steps
- Removing existing prompts as redundant
- Changing step ordering or phase structure
- Any change that removes substantial existing content

**Instructions:**

- Read spec and lessons files first to understand context and discoveries
- Make targeted improvements to existing prompts to improve clarity and actionability
- Preserve all code examples, file paths, and technical specifications
- If you identify opportunities for new prompts, redundant steps, or reordering - STOP and ask for approval
- Focus on making the existing plan more actionable based on real implementation experience"
