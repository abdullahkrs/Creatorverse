# Creatorverse Design System v1

This is the authoritative visual and interaction standard for all visible product work.

## Design goal
Creatorverse must feel like a deliberate game product, not a generic AI-generated landing page or SaaS dashboard.

## Non-negotiable principles
- Interaction explains the product; copy supports it.
- One dominant action per view.
- Mobile-first composition from 320 px upward.
- Distinctive product identity over default kit styling.
- Arabic and English are designed together; RTL is composed, not merely mirrored.
- Accessibility is part of the design, not a QA afterthought.
- Decorative effects must have a gameplay or hierarchy purpose.

## Anti-template rules
Reject visible work that relies on any combination of:
- oversized marketing headlines;
- repeated feature cards;
- generic purple gradients, glass panels, glows, orbit graphics, or particles;
- emoji or placeholder symbols as final product icons;
- long explanatory paragraphs before the user can act;
- dashboard layouts with no gameplay reason;
- recoloring without simplifying structure.

## Visual hierarchy
Every view must answer, in order:
1. Where am I?
2. What changed or matters now?
3. What is the next action?
4. Where can I find optional detail?

## Copy budget
- Screen title: 3–7 words.
- Supporting text: 1–2 short lines.
- Primary action: 1–3 words.
- Secondary action: only when necessary.
- Card description: maximum 120 characters per language unless the issue documents an exception.
- No repeated explanation across hero, card, banner, and button.

## Component rules
- Minimum primary touch target: 44 × 44 CSS px.
- Minimum exceptional target: 24 × 24 CSS px with safe spacing.
- Use one icon family for interface controls.
- Creatorverse realm, role, mission, and energy visuals require custom SVG or original artwork.
- Every interactive component defines default, hover, focus, pressed, selected, disabled, loading, error, and success states when applicable.
- Hover may enhance but never reveal the only path to a function.

## Layout
- Use Grid, Flexbox, intrinsic sizing, logical properties, and container queries.
- Avoid fixed page widths and fixed-height content containers.
- Reading width should normally stay within 55–70 characters.
- Extra desktop space should support context or gameplay, not stretch text.

## Motion
Motion must explain state change, progression, success, reveal, or spatial relationship. Persistent decorative motion is prohibited. All motion must support `prefers-reduced-motion`.

## Evidence required
Any significant visible change must provide evidence at 390 px, 768 px, and 1440 px in both Arabic and English, plus a before/after comparison or equivalent measurable visual review.