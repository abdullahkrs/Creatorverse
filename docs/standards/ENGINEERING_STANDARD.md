# Frontend Engineering Standard v1

## Architecture
- Deliver one coherent vertical slice per issue.
- Separate product components from low-level primitives.
- Keep domain terms explicit: realm, role, mission, district, energy, result.
- Do not introduce generic abstractions before a second real use case exists.
- Prefer progressive migration over broad rewrites.

## Security and privacy
- Escape all imported or user-controlled content.
- Validate server and client inputs with allowlists and length limits.
- Use official APIs, oEmbed, and OAuth only; never scrape or collect social passwords.
- Keep secrets server-side and in Railway/GitHub secret stores.
- Do not expose private messages, follower lists, precise location, or unrestricted file uploads.

## Localization
- Arabic and English changes ship together.
- User-visible copy must come from the localization system.
- Avoid string concatenation that breaks Arabic grammar or bidirectional text.
- Use semantic HTML and logical CSS properties.
- Test long text, numbers, punctuation, and mixed-direction content.

## CSS
- Use design tokens before hardcoded values.
- Use mobile-first rules and content-based breakpoints.
- Prefer Grid/Flexbox, intrinsic sizing, `clamp`, `min`, `max`, and container queries.
- Avoid fixed-height content, physical left/right properties, and arbitrary z-index escalation.
- A new visual effect must have a documented hierarchy or gameplay purpose.

## Components
Every reusable interactive component must define:
- semantic element and accessible name;
- keyboard behavior and focus visibility;
- touch target size;
- loading, empty, error, disabled, selected, and success states when applicable;
- Arabic RTL and English LTR behavior;
- teardown for listeners, timers, animation, and requests.

## Testing
Minimum checks for visible changes:
- unit tests for logic and validation;
- `npm run check`;
- 320/390/768/1024/1440 responsive review as applicable;
- keyboard-only path;
- Arabic and English paths;
- no unintended horizontal overflow;
- reduced-motion behavior;
- Railway Preview `/health` and `/version` identity.

When React migration occurs, add Storybook, Vitest, Playwright, axe, and screenshot comparisons incrementally through dedicated issues.

## Performance
- Set image dimensions and use responsive formats.
- Avoid loading desktop-sized media on mobile.
- Avoid long main-thread animation and unnecessary dependencies.
- Preserve usable loading and error states on slow connections.

## Definition of professional UI completion
A visible slice is not complete when it merely functions. It must also have clear hierarchy, minimal copy, intentional spacing, original identity, complete states, responsive composition, keyboard access, and Arabic/English parity.