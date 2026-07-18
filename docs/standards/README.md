# Creatorverse Standards Index

All autonomous agents must read the standards relevant to their role before changing requirements, code, or release state.

## Required references
- `DESIGN_SYSTEM.md` — visual identity, hierarchy, copy budget, components, motion, and anti-template rules.
- `RESPONSIVE_STANDARD.md` — mobile, tablet, desktop, RTL/LTR, input, and validation requirements.
- `LIBRARY_POLICY.md` — approved target stack and staged dependency-adoption rules.
- `ENGINEERING_STANDARD.md` — architecture, security, localization, CSS, components, testing, and performance.
- `src/design-system/tokens.css` — executable design constants for all new visible UI.

## Role map
- Product Lead: read all standards when creating visible-product work.
- Game & UX: read Design System and Responsive Standard.
- Safety Review: read Engineering Standard plus product safety boundaries in `AGENT.md`.
- Engineer: read all standards and use tokens before adding hardcoded visual values.
- QA & Release: verify all applicable standards and reject default-kit or AI-template output.

## Conflict order
1. Safety, privacy, security, and legal constraints.
2. Active issue acceptance criteria.
3. `AGENT.md`.
4. These standards.
5. Existing implementation conventions.

When implementation conflicts with a standard, fix the implementation or record a narrow, temporary exception in the active issue. Do not silently ignore the standard.