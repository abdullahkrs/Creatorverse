# Frontend Library Policy v1

## Approved target stack
Adopt incrementally when a focused issue justifies the migration:
- Vite
- React
- TypeScript
- Tailwind CSS for layout, tokens, responsive utilities, and state variants
- Radix UI Primitives for accessible behavior without imposed visual styling
- Lucide React for generic interface controls only
- Motion for purposeful state and layout transitions
- React Hook Form and Zod for forms and validation
- react-i18next for scalable Arabic/English localization
- Storybook for isolated component states
- Vitest for unit/component tests
- Playwright and `@axe-core/playwright` for responsive, interaction, visual, and accessibility checks

## Current-cycle rule
The current vanilla Vite prototype remains valid until a dedicated migration issue is approved. Do not perform a broad framework migration while delivering an unrelated feature.

## Adoption rules
- Add a dependency only when the active vertical slice uses it.
- Record why the native platform or existing dependency is insufficient.
- Prefer accessible unstyled primitives over visually opinionated UI kits.
- Do not copy a default theme and call it the Creatorverse design system.
- Do not install large component sets preemptively.
- Avoid duplicate libraries that solve the same concern.
- Keep bundle, maintenance, licensing, and security impact explicit.

## Prohibited defaults
Do not ship default Bootstrap, Material UI, Ant Design, Chakra, or unmodified shadcn visual language. shadcn structures may be used selectively only after full Creatorverse visual restyling.

## Icon policy
Lucide may represent universal controls such as close, settings, share, sound, language, and navigation. Realm, role, mission, district, progression, and reward identity require original Creatorverse artwork or custom SVG.

## Motion policy
Motion is allowed only for state, spatial relationship, progression, feedback, and reveal. Never add animation libraries solely for decorative backgrounds, particles, glowing loops, or perpetual motion.

## Dependency acceptance checklist
- Active issue requires it.
- Maintained and license-compatible.
- No overlapping installed solution.
- Accessibility behavior is verified.
- Arabic/RTL compatibility is verified.
- Bundle impact is acceptable.
- Tests and rollback path are included.