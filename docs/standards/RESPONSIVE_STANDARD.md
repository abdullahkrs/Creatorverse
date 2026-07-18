# Responsive Experience Standard v1

## Strategy
Use one shared product experience that adapts by available space, content pressure, input method, and language. Do not build separate mobile, tablet, and desktop products.

## Baseline ranges
These are implementation starting points, not device-specific contracts:
- Base: 0–39.99rem
- Compact/tablet: 40–63.99rem
- Wide/tablet landscape and laptop: 64–79.99rem
- Desktop: 80rem+

Choose or adjust breakpoints only when content, controls, or hierarchy demonstrably fail.

## Required layouts
### Phone
- One primary column.
- 16 px minimum page padding.
- Primary action visible without excessive scrolling.
- Secondary detail uses progressive disclosure, sheet, or disclosure panel.
- No essential hover behavior.

### Tablet
- Main task plus optional contextual region.
- Context must collapse cleanly in portrait.
- Do not add columns solely because space exists.

### Desktop
- Navigation, main experience, and optional context may coexist.
- Keep total content width bounded.
- Support mouse and keyboard without degrading touch.

## Required validation sizes
- 320 × 568
- 390 × 844
- 768 × 1024
- 1024 × 768
- 1440 × 900

Also validate portrait, landscape, 200% text zoom, keyboard-only use, reduced motion, Arabic RTL, and English LTR.

## Acceptance gates
- No unintended horizontal page scroll at 320 px.
- Core functions remain available at every width.
- Touch targets and spacing remain usable.
- Focus order follows reading and visual order.
- Rotation or resize does not lose user state.
- No layout depends on exact commercial-device dimensions.
- Images use intrinsic dimensions and responsive delivery.
- Components use container queries when reused in materially different parent widths.

## RTL/LTR
Use logical CSS properties such as `margin-inline`, `padding-inline`, `inset-inline-start`, and `text-align: start`. Mirror directional controls when meaning requires it; do not mirror neutral icons or artwork automatically. Arabic layouts may require different composition and line limits, not only `dir=rtl`.