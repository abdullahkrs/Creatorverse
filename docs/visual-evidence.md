# Professional visual release evidence

## CV-MVP-003 — Share-ready mission result

### Scope

Mission completion now replaces the route controls with one compact Creatorverse field receipt inside the existing playable area. The result preserves the selected role and route, shows the `+3` contribution and `72 → 75` district change, then exposes exactly one native-share or copy-fallback action.

### Before → after

| Gate | Before | After |
|---|---|---|
| Completion hierarchy | One plain success sentence after two disabled route controls. | Outcome → contribution → district change → four compact facts → one result action. |
| Result identity | Text-only status with no connection to the signal-route map. | Angular signal rail, activated node, role glyph, and district gate language derived from the existing Creatorverse map. |
| Sharing | No result action. | Web Share when supported; otherwise one localized copy action. The two actions never compete. |
| States | Complete only. | Pending, shared/copied, cancelled/denied, failed, unsupported, invalid URL, retry, and repeated-activation guard. |
| Accessibility | Polite sentence announcement. | One completion live announcement, focus moved to the result heading, separate action-status live feedback, visible focus, and a minimum 44 px action target. |
| Arabic | Generic post-render translation of the sentence. | Dedicated synchronized Arabic/English result copy, intentional RTL composition, and isolated LTR energy/progress values. |

### Responsive composition evidence

[`docs/visual-evidence/mission-result-layout.svg`](visual-evidence/mission-result-layout.svg) records source-aligned before/after and responsive compositions for:

- 320 × 568 English LTR, including the full-width 52 px action and 2 × 2 facts.
- 390 × 844 English LTR and Arabic RTL.
- 768 × 1024 English and Arabic two-region composition.
- 1440 × 900 bounded English and Arabic desktop composition.

The SVG is equivalent composition evidence generated from the implemented semantic structure and CSS rules; it is not presented as a browser screenshot. Final QA must still capture Railway Preview screenshots at 390, 768, and 1440 in both languages and verify 320 px overflow, 200% text zoom, touch targets, and reduced motion against the exact PR head.

### Implemented source gates

- Phone-first single-column result with no fixed content height.
- `minmax(0, 1fr)` and `min-inline-size: 0` prevent intrinsic overflow.
- A content breakpoint at `40rem` introduces the two-region composition only when the result content fits.
- Progress values use `<bdi dir="ltr">`; layout and spacing use logical properties.
- The primary action uses `--cv-target-min` and spans the result width on phones.
- The progress gain runs once using `--cv-duration-progress`; reduced-motion mode removes it.
- Result text is escaped for HTML; share fields are allowlisted, bounded, and emitted as plain text.

### Automated evidence

- `test/mission-result.test.js` covers result bounds, localized safe payloads, unsafe URL rejection, native share success/cancel/denial/failure, clipboard fallback success/failure, unsupported capability, and repeated activation.
- `test/design-gate.test.js` verifies semantic result structure, one action identifier, bilingual copy, 44 px target use, responsive breakpoint, mixed-direction handling, and reduced-motion CSS.

## 2026-07-18 — Foundation visual repair

### Scope

This evidence covers the focused release-gate repair for the first playable Creatorverse slice. Functional behavior, the fictional-world safety acknowledgement, localization, social error handling, and Railway identity checks were preserved.

### Before → after comparison

| Gate | Before | After |
|---|---|---|
| First action | A tall marketing hero, two competing calls to action, a 430 px realm card, and import sections preceded the role loop. | Role choice and the 35-second mission are the first product content after navigation. |
| Visual language | Purple/cyan gradients, glow effects, orbital decoration, pill controls, repeated rounded cards, and Unicode geometry. | Flat semantic surfaces, a product-specific signal-route map, compact rectangular controls, and custom inline SVG role/realm symbols. |
| Copy | The creator/audience/safety promise repeated across the hero, import sections, loop, and three principle cards. | One task title, compact role labels, mission feedback, and optional creator tools behind disclosure. |
| Mobile hierarchy | A 3.35rem phone headline and tall sections pushed the loop far below the first viewport. | A bounded headline, three compact role controls, and mission routes form the opening interaction sequence at 320 px and 390 px. |
| RTL | Mainly direction and text-alignment overrides. | Explicit desktop grid composition, logical properties, RTL action order, isolated LTR URLs/numbers, and Arabic-aware preview composition. |
| Touch | Floating language buttons were 36 px high. | Primary controls and language buttons use the 44 px interaction token. |

### Equivalent visual-regression evidence

[`docs/visual-evidence/mobile-layout.svg`](visual-evidence/mobile-layout.svg) records the final mobile hierarchy in English LTR and Arabic RTL at the two required phone widths. It shows the implemented navigation, role order, mission priority, action placement, and composed RTL order rather than only a recolored surface.

Headless Chromium validation was also executed against the final foundation source at:

- 320 × 568 — English LTR and Arabic RTL.
- 390 × 844 — English LTR and Arabic RTL.
- 768 × 1024 — English LTR and Arabic RTL.
- 1024 × 768 — English LTR and Arabic RTL.
- 1440 × 900 — English LTR and Arabic RTL.

For all ten foundation viewport/language combinations:

- `scrollWidth` equaled `clientWidth`; no horizontal overflow was detected.
- The language controls computed to 44 px minimum height.
- The creator path remained visible.
- Role selection enabled the mission routes.
- Route completion produced the success state.
- Unchecking the safety acknowledgement blocked launch, set `aria-invalid`, announced the localized error, and restored focus.
- Re-checking the acknowledgement allowed the creator preview to launch.

### Automated guard

`test/design-gate.test.js` rejects the removed template effects, placeholder symbols, oversized legacy values, a reintroduced marketing hero/principles section, missing custom SVG identity, missing 44 px touch tokens, missing mixed-direction URL handling, or missing explicit RTL desktop composition.

### Responsive implementation notes

The foundation CSS uses one-column mobile composition, intrinsic grids from 40rem, and a two-region experience from 64rem. The Arabic desktop layout assigns the playable area to the right and the realm status to the left through explicit grid areas. No fixed content heights or fixed page widths are used.
