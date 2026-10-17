# ERC20T design system

## Overview

ERC20T is a working launch console for token creators and owners. The interface combines warm off-white surfaces, dark olive text, and a burnt-orange primary action. A code-drawn token carrying the six-spoke brand mark is the one illustrative idea; it appears in the configuration preview and share image.

The main task comes before explanation. The create page puts a three-step form beside a live configuration summary on desktop. On a phone the form comes first. Discovery uses factual token cards; the owner page uses clearly separated market information and settings. There are no fabricated market charts, gradients, decorative animations, or marketing sections before the form.

Source of truth: `src/styles.css` for tokens and layout, `src/ui.tsx` for shared primitives, and the route components for product patterns. This document describes the final source, not a proposed redesign.

## Colors

Hex primitives and semantic aliases are declared at the top of `src/styles.css`.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#f6f5f1` | Page and header |
| `--color-surface` | `#ffffff` | Forms, token cards, fields, dialogs |
| `--color-preview` | `#efeee7` | Configuration preview and subdued information areas |
| `--color-text` | `#242b23` | Primary text, neutral selected controls, wallet button |
| `--color-muted` | `#61665b` | Supporting text and descriptions |
| `--color-border` | `#dedfd5` | Structural separators and panel outlines |
| `--color-input-border` | `#b9bdb0` | Interactive field boundaries |
| `--color-accent` | `#bf4026` | Main action, selected launch mode, active progress, brand |
| `--color-accent-hover` | `#ab351d` | Primary button hover |
| `--color-accent-soft` | `#fff0e9` | Selected launch mode and token identifiers |
| `--color-focus` | `#486b3f` | Keyboard focus outline |
| `--color-success` / `--color-success-bg` | `#38623c` / `#eaf2e9` | Read/eligibility/confirmation states, always with text or icons |
| `--color-error` / `--color-error-bg` | `#a62d23` / `#fff0ec` | Recoverable errors |

`#939c7f` distinguishes the creator segment of the allocation bar from the dark liquidity segment; both segments have explicit labels and percentages. The decorative token illustration uses `#f27752`, `#d34427`, `#a83c22`, and cream `#fff8e9` independently of functional status colors.

Measured rendered/token pairs are recorded in `artifacts/contrast.json`: primary text on page 13.32:1, secondary text on page 5.41:1, secondary text on preview 5.07:1, white on primary action 5.28:1, brand accent on page 4.84:1. The final entry-page probe passes its solid-background contrast checks. This is a light-only design; no unimplemented dark theme is implied.

## Typography

The locally bundled variable WOFF2 at `public/fonts/dm-sans-latin.woff2` provides **DM Sans**, with `Arial, sans-serif` fallbacks. The CSS face declares weight 100–1000; the interface uses only **400, 500, and 600**. Font loading was observed in the browser. The font license is in `public/fonts/OFL.txt`.

| Token | Value | Role |
| --- | --- | --- |
| `--text-xs` | 12 px | Hints, metadata, badges, compact labels |
| `--text-sm` | 14 px | Dense interface body, buttons, descriptions |
| `--text-base` | 16 px | Form inputs, prose guide, tertiary headings |
| `--text-heading` | 20 px | Section headings |
| `--text-title` | 28 px | Token name preview, desktop wordmark |
| `--text-display` | 44 px; 32 px at ≤780 px | Page headings and the large current-tax value |

At ≤350 px the create heading uses the existing 28 px title size. On narrow token pages the token name also uses 28 px. The rendered entry uses five distinct sizes at 390 and six at 1440, including one-offs; no new font-size tier is introduced for a single component.

Heading line-height is 1.1–1.4 by level; ordinary body/hints use 1.5; guide paragraphs use 1.65. Large headings use `-.045em` tracking (mobile `-.04em`), section headings `-.025em`; body text is untracked. Headings use balanced wrapping and supporting paragraphs use pretty wrapping. No tracked capital kickers are used.

Addresses use `ui-monospace, SFMono-Regular, Consolas, monospace` at 12 px. Long addresses and token names wrap with `overflow-wrap: anywhere`; full values are available in detail/review views and copy controls. Abbreviated wallet/card addresses lead to a full address. Changing numeric data uses tabular figures. All text-entry controls remain 16 px on phones to avoid iOS input zoom.

## Layout

The maximum main content width is **1160 px**, normally inset 40 px from each viewport side. The header is up to 1328 px wide including padding. Desktop create layout is `1.5fr / 1fr`, with a 320 px minimum preview width, a 24 px gutter, and top alignment. Forms use 32 px inner spacing on large screens. The preview is not sticky, so no content is covered while scrolling.

The spacing tokens are 4, 8, 12, 16, 24, 32, and 48 px. Components also use 10/18/20/22 px optical adjustments and compact 6 px icon gaps. Keep roughly twice as much space between field groups as between a label and its control. The CSS has deliberate product-specific values; it is not a strict utility spacing library.

Responsive rules, all in `src/styles.css`:

- **≤1080 px:** header/main insets reduce to 32 px; the network label is removed while the wallet control remains; form padding is 24 px; discovery becomes two columns.
- **≤780 px:** create and detail workspaces stack. The preview briefly uses an internal two-column arrangement to use tablet width. Display type becomes 32 px. Insets are 24 px.
- **≤570 px:** logo/wallet share the top row, navigation gets its own row, and main content is inset 16 px. The preview becomes a simple vertical summary. The form uses 18 px side padding. Discovery is one column; filters and address lookup wrap. The wallet dialog is a bottom sheet with safe-area padding. Feature explanations stack after the product.
- **≤350 px:** insets/padding reduce slightly, the nonessential section icon is omitted, and base choices wrap to two columns. Controls and meaningful text remain present.

The create page and token detail were checked at **320, 390, 780, and 1440 px**, with rendered mobile/desktop screenshots. At 390×844 the first-screen action ends at 814.66 px. The pinned probe found no horizontal scroll, text overlap, clipped text, or floating-control collisions at its three widths. Native 200% zoom and a translated/RTL layout were not verified; the delivered interface is English.

## Elevation & Depth

The surface system is flat. Panel outlines identify structure; the preview uses a tonal background without a shadow. Fields and selected controls have their own interactive borders. Avoid combining a decorative shadow and border on the same card.

Only dialogs have elevation: `0 24px 80px #16201033`, no border, and `#20251dc0` native backdrop. Native `dialog.showModal()` supplies the top layer and an inert background. The skip link is above ordinary content and becomes visible on keyboard focus. No sticky footer action can cover form content.

## Shapes

Fields/buttons use **8 px** radius; desktop panels use **16 px**; mobile panels **12 px**; token identifiers are circular. Wallet rows use **10 px**, dialogs **20 px**. Phone dialogs round only their top corners. Compact status labels use 5–6 px radii, not large decorative pills. Structural borders are 1 px. The focus perimeter is 2 px with a 4 px offset.

## Components

| Component / source | Usage and behavior |
| --- | --- |
| `Mark` · `src/ui.tsx` | Six-spoke SVG; `small` variant for the footer. Brand assets remain local. |
| `.button` · `src/styles.css` | `primary`, `secondary`, `quiet`, `full`, wallet variants. Primary actions are orange, other actions neutral. Visible hover/active/focus/disabled states. Most task actions are 44–48 px tall. |
| `Field` · `src/ui.tsx` | Visible label, optional hint or inline error, stable input ID. Callers provide native input and `aria-invalid`/description linkage. Validation focuses the first invalid create field. |
| `Notice`, `Busy` · `src/ui.tsx` | Recoverable information/error blocks and labelled loading state. Errors use `role=alert`; progress uses `role=status`. |
| `Modal` · `src/ui.tsx` | Native dialog with labelled heading, X, Escape/backdrop dismissal, explicit Tab wrap, and native focus return. `dismissible=false` keeps a submitted owner action visible while processing. |
| `AddressValue` · `src/ui.tsx` | Full checksummed, wrapping address; optional explorer link; copy control with success or manual-copy fallback. |
| `Stat` · `src/ui.tsx` | Label/value row, wrapping values, tabular numbers. |
| `Create`, `TaxChart` · `src/Create.tsx` | Three-step wizard, native launch-mode radios, base choices, allocation/tax ranges, launch-decay switch, optional recipients, final review and acknowledgement. Chart is a configuration illustration with accessible text, not a market-price chart. |
| `WalletProvider`, `ConnectControl` · `src/wallet.tsx` | One persistent header control. EIP-6963 names/icons; real local wallet marks; mobile deep links; Coinbase Smart Wallet; row pending state; rejection recovery; full account/disconnect dialog. |
| `TokenCard`, `Explore` · `src/Explore.tsx` | Live-read token cards, status text, search, filters, loading/error/empty states and pagination. No card has fabricated performance data. |
| `TokenPage`, `OwnerControls` · `src/Token.tsx` | Latest chain tax, block/time provenance, fee split, complete contract details, owner-only inputs and review-before-sign dialogs. Nonowners can inspect; permissions cannot be written. |
| `TransactionStatus` · `src/transactions.tsx` | Simulation, signing, pending, confirmation, error, explorer, and receipt-recheck states. An in-flight guard and submitted hashes prevent accidental duplicate requests. Confirmed reverts/cancellations offer “Clear failed attempt”; unresolved receipts offer “Check confirmation”. |

Lucide is the interface icon set, rendered using current text color. Decorative SVGs are hidden from accessibility; action icons have visible labels or explicit accessible names.

Motion is only enabled under `prefers-reduced-motion: no-preference`. Button color/border changes use 150 ms transitions; press scale is 0.96 with `cubic-bezier(.2,0,0,1)`. Loading icons rotate only when motion is permitted. There is no `transition: all`, entrance choreography, autoplay, or continuously animated decoration. Reduced motion retains labelled static loading feedback.

## Do's and Don'ts

- Start another route with `.page-heading` inside `.main-content`; reuse the existing task/content order and native controls.
- Keep the orange fill on the main task action. Use secondary buttons for reviewable owner changes, then a primary button in the confirmation dialog.
- Reuse semantic color/type tokens. Keep addresses and numbers selectable, wrapping, and fully available.
- State exactly which block or loaded page a figure represents. Never use decorative market charts or sample tokens as live data.
- Keep field guidance close to its control. Explain permanent liquidity locking and gas before a wallet signature.
- Preserve native dialog semantics, explicit keyboard wrap, and focus return when modifying wallet/review flows.
- Do not add nested card surfaces, extra font families, tracked capital labels, root-relative assets, or a breakpoint that hides the primary action.

The six-domain review and its measured evidence are in `artifacts/validation.md`. Passing those sampled checks is not a claim of full accessibility compliance or physical-wallet testing.
