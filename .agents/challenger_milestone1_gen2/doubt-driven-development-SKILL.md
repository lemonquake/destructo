# Doubt-Driven Development
This is a copy of the doubt-driven-development SKILL.md.
A decision is non-trivial when it introduces branching logic, crosses boundaries, asserts unverified properties, depends on invisible context, or is irreversible.
Process:
1. CLAIM - Write the claim + why-it-matters.
2. EXTRACT - Isolated artifact + contract, strip reasoning.
3. DOUBT - Invoked fresh-context reviewer with adversarial prompt.
4. RECONCILE - Classify findings: contract misread / actionable / trade-off / noise.
5. STOP - Met stop condition (trivial findings, 3 cycles, user override).
In non-interactive mode, cross-model is skipped.
