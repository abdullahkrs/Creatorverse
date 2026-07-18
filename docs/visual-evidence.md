# Professional visual release evidence

## Scope

This evidence covers the focused release-gate repair for the first playable Creatorverse slice. Functional behavior, the fictional-world safety acknowledgement, localization, social error handling, and Railway identity checks were preserved.

## Before → after comparison

| Gate | Before | After |
|---|---|---|
| First action | A tall marketing hero, two competing calls to action, a 430 px realm card, and import sections preceded the role loop. | Role choice and the 35-second mission are the first product content after navigation. |
| Visual language | Purple/cyan gradients, glow effects, orbital decoration, pill controls, repeated rounded cards, and Unicode geometry. | Flat semantic surfaces, a product-specific signal-route map, compact rectangular controls, and custom inline SVG role/realm symbols. |
| Copy | The creator/audience/safety promise repeated across the hero, import sections, loop, and three principle cards. | One task title, compact role labels, mission feedback, and optional creator tools behind disclosure. |
| Mobile hierarchy | A 3.35rem phone headline and tall sections pushed the loop far below the first viewport. | A bounded headline, three compact role controls, and mission routes form the opening interaction sequence at 320 px and 390 px. |
| RTL | Mainly direction and text-alignment overrides. | Explicit desktop grid composition, logical properties, RTL action order, isolated LTR URLs/numbers, and Arabic-aware preview composition. |
| Touch | Floating language buttons were 36 px high. | Primary controls and language buttons use the 44 px interaction token. |

## Equivalent visual-regression evidence

[`docs/visual-evidence/mobile-layout.svg`](visual-evidence/mobile-layout.svg) records the final mobile hierarchy in English LTR and Arabic RTL at the two required phone widths. It shows the implemented navigation, role order, mission priority, action placement, and composed RTL order rather than only a recolored surface.

Headless Chromium validation was also executed against the final source at:

- 320 × 568 — English LTR and Arabic RTL.
- 390 × 844 — English LTR and Arabic RTL.
- 768 × 1024 — English LTR and Arabic RTL.
- 1024 × 768 — English LTR and Arabic RTL.
- 1440 × 900 — English LTR and Arabic RTL.

For all ten viewport/language combinations:

- `scrollWidth` equaled `clientWidth`; no horizontal overflow was detected.
- The language controls computed to 44 px minimum height.
- The creator path remained visible.
- Role selection enabled the mission routes.
- Route completion produced the success state.
- Unchecking the safety acknowledgement blocked launch, set `aria-invalid`, announced the localized error, and restored focus.
- Re-checking the acknowledgement allowed the creator preview to launch.

## Automated guard

`test/design-gate.test.js` rejects the removed template effects, placeholder symbols, oversized legacy values, a reintroduced marketing hero/principles section, missing custom SVG identity, missing 44 px touch tokens, missing mixed-direction URL handling, or missing explicit RTL desktop composition.

## Responsive implementation notes

The final CSS uses one-column mobile composition, intrinsic grids from 40rem, and a two-region experience from 64rem. The Arabic desktop layout assigns the playable area to the right and the realm status to the left through explicit grid areas. No fixed content heights or fixed page widths are used.
