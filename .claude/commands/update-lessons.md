---
argument-hint: "[spec-file-path]"
description: Update lessons learned from current implementation work
allowed-tools: ["Read", "Write", "Edit"]
---

## System Context

Read the spec file to understand the project context and current implementation status. The lessons learned file captures implementation discoveries for future reference.

## File Structure

- Spec file: $ARGUMENTS (contains project context and current status)
- Lessons file: $ARGUMENTS-lessons-learned.md (implementation discoveries)

## Task

First read @$ARGUMENTS to understand the project and current progress, then update lessons learned.

**Specific prompt to execute:**

"Based on the project described in @$ARGUMENTS and current implementation progress, please update @$ARGUMENTS-lessons-learned.md with recent implementation discoveries:

1. **Implementation Insights**: Key discoveries about what worked well or caused issues during recent implementation
2. **Critical Path Findings**: Important sequencing discoveries (what must be done before what)
3. **Technical Decisions**: Specific technical choices that proved effective or problematic
4. **Pitfalls and Solutions**: Issues encountered and how they were resolved
5. **Future Improvements**: What would make similar future work smoother and reduce back-and-forth

**Instructions:**

- You MUST focused on the stuff that can be generalized to smooth further work or improve understanding of the project
- Read the spec file first to understand project context
- Add to existing lessons content, don't replace it
- Organize by phase/topic with clear headings
- Include specific technical details and file references
- Focus on actionable insights for future similar work
- Use bullet points and clear structure for easy reference"
