---
name: brainstorm
description: Develop an idea iteratively into a detailed specification by asking one question at a time. Use when the user wants to brainstorm or refine an idea before implementation.
---

# Brainstorm an idea

Turn the user's idea into a detailed specification that can be handed to a
developer.

Ask exactly one question at a time. Each question should build on the previous
answers and resolve the most important remaining uncertainty.

Before asking the next question, append the previous question and its answer to
`qa.md`. Do not combine multiple questions into one message.

Continue until the goals, scope, behavior, constraints, edge cases, and relevant
technical decisions are clear. Then ask whether the user is ready for the
specification to be written. Only after confirmation, save it as `spec.md`.

After saving the specification, ask whether the user wants to create a new GitHub
repository for it. Do not create a repository, commit, or push anything unless
the user explicitly confirms. If confirmed, collect any missing repository
details before taking those actions.
