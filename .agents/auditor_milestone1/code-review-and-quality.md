# Code Review and Quality

Loaded from C:\Users\Lemon PC\.gemini\config\plugins\agent-skills\skills\code-review-and-quality\SKILL.md
Core methodology: Conducts multi-axis code review across correctness, readability, architecture, security, and performance.
Key checks:
1. Correctness: matches spec/requirements, handles edge/error cases, passes tests.
2. Readability: descriptive names, straightforward flow, no unnecessary complexity.
3. Architecture: follows patterns, clean boundaries, no circular dependencies.
4. Security: no secrets, validate inputs at boundaries, treat external data as untrusted.
5. Performance: no N+1 queries, no unbounded loops/fetching, no heavy objects in hot paths.
Change sizing: ~100 lines is good, ~300 acceptable, split ~1000 lines.
Review process: Understand context -> Review tests first -> Review implementation -> Categorize findings -> Verify the verification.
