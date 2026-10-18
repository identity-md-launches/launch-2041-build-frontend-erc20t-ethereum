# Implementation and validation

**Complete for the stated scope.** Worker checks ran on 2026-10-18 against the final production export. This report records their actual coverage and limits; it is not independent certification. No transaction was signed or broadcast.

## Requirements and scope

| Requirement | Result and evidence |
| --- | --- |
| Update mainnet hook | Met: supplied Ethereum contracts in `src/networks.ts`; getters and launch simulations passed |
| Include Robinhood version | Met: chain 4663, separate contracts/bases, persistent selector, URL selection, wallet switching and chain-specific reads/writes |
| Four market-cap options with current IMD/FWA/ETH prices | Met: shared controls, live third-party quotes, exact conversion and factory preview in atomic and deferred launches; Ethereum has all three bases, Robinhood has verified ETH/IMD |
| Usable responsive website and primary interactions | Met within tested scope: 21 browser scenarios, four viewport widths, keyboard operation and error recovery |
| Complete static export plus source and lockfile | Met: `dist/index.html` and required assets included; existing manifest/lockfile and build configuration retained |
| Production build, typecheck and interaction validation | Ran and passed; results below |
| Better Interface applied, six-domain review and corrections | Checked, documented below; final source described in root `DESIGN.md` |
| Product/action on first 390 px screen | Met on both networks at 390×844; action bottom 814.66 CSS px |
| Title, favicon, description, og:title and og:image | Present in exported HTML; local share image loaded |
| Install/preview/rebuild documentation | Root `README.md` includes ordinary and external-directory workflows |

The existing React/TypeScript/Vite stack, warm neutral/orange visual system, EIP-6963/mobile/Coinbase connection paths, contract ABIs and launch economics were retained. No new dependency or backend was introduced. The single visual idea remains a code-drawn ERC20T token with the six-spoke mark inside a task-first launch console.

Consequential choices: market cap means total-supply valuation including creator allocation; ~$150k is the default; quote failure requires retry or explicit manual price entry; network changes clear unsigned state. Robinhood FWA was not guessed because no verified address was supplied/found. Other eligible bases are accepted by address. The requester supplied all deployment addresses needed for the work.

## Commands and actual results

| Command/check | Actual result |
| --- | --- |
| `bash scripts/staged-build.sh` | Exit 0; `tsc --noEmit` and `vite build` both passed after final application changes |
| `npm test` in isolated build tree | Exit 0; 18 tests passed, 0 failed/skipped |
| `npm run validate` in isolated build tree | Exit 0; 21/21 scenarios, seven axe scans with 0 violations, no uncaught errors or failed local resources |
| `npm run check:contracts` | Exit 0; 47/47 checks, 26 Ethereum and 21 Robinhood |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0; 16/16 checks, final Ethereum export |
| Same probe with Robinhood preview URL and `--out test/scratch/taste-robinhood` | Exit 0; 16/16 checks, final Robinhood export |
| MCP browser inspection of production export under `/preview/` | Live ETH/IMD quotes, eligibility/price previews, keyboard radio changes and screenshots; final console had 0 errors/warnings/messages |
| `git diff --check` | Passed; packaging and forbidden-path audit recorded in `package-check.json` |

The probe used `IMD_PLAYWRIGHT=/tmp/erc20t-build/node_modules/playwright/index.mjs`; browsers and all installed tooling stayed outside the repository. Standard npm scripts and the unchanged lockfile were used. An initially unwritable default npm cache was resolved with an explicit `/tmp` cache. Missing WebKit libraries/Mesa were extracted into temporary tooling directories and made available through its library paths; host-cache validation was bypassed because those libraries were not registered globally. **The actual WebKit rendering and interaction scenario passed**, rather than being skipped. This workaround is not a shipped runtime dependency.

The build produced a 720.21 kB main application chunk (211.09 kB gzip), with Vite's existing 650 kB advisory. It is an advisory, not a build failure. No unnecessary package archives, caches or dependency directories are shipped.

## Interaction and contract evidence

[interactions.json](interactions.json) contains the 21 passing scenario names and seven axe states. They cover: subpath assets/metadata; entry reflow; modal focus trap/return and rejection; form errors and preservation; allocation/tax/decay; eligible/custom bases; recipient validation and rounded previews; deploy-first; live Ethereum discovery/search/filters; details/permissions; mobile wallet paths; offline index recovery; EIP-6963 naming and wrong-chain switching; correct ABI/zero-base-deposit encoding; expired quote rejection; deferred launch; all four market caps and supply/base changes; price failure/manual recovery; and Robinhood network isolation and launch encoding. Chromium carries most automated interaction coverage; WebKit exercises the mobile token, launch/review and native wallet-dialog flow, not every Chromium scenario.

[live-contract-checks.json](live-contract-checks.json) records the live getter/bytecode, base metadata/eligibility, both currency-order preview, deploy-only and atomic-launch checks. Starting block observations were Ethereum **26221051** and Robinhood **91959874**. Calls during the run were not all pinned to these blocks. The scripts never send transactions. See [contract-research.md](contract-research.md) for deployment sources and limitations.

**Fixture boundaries:** automated USD responses are deterministic ($2,500 ETH, $5 IMD, $0.008 FWA) so expected base units can be asserted exactly. They are not included as fallback product data. RPC reads and factory previews remain live. The synthetic EIP-6963 wallet uses a public onchain owner's address for read-only simulation, handles switching, and rejects every signing request. To reach a deferred owner launch without deploying a token, one existing token's `launched`/reserved-balance reads and its `launch` `eth_call` response are overridden in the browser harness. This verifies frontend total-supply valuation, reserved liquidity, preview/review and encoding, **not execution of an actual unlaunched token**. Live product quotes were separately exercised in the MCP browser for ETH, Ethereum IMD and Robinhood IMD.

## Six-domain Better Interface review

The pinned workflow, core principles of all six domains and implementation-documentation section informed the changes. Existing design conventions remained authoritative. Coverage refers to sampled states of the finished export, not every combination of wallet, token and browser.

| Domain | Coverage and evidence | Explicit limitations / not applicable |
| --- | --- | --- |
| Accessibility — Checked | Native labelled select and fieldset/radios; Tab/ArrowRight changes the cap and recalculates; visible focused radio screenshot; modal focus trap/return, invalid-field focus, alerts/status labels; seven axe states, 0 violations; reduced-motion probe passed | Screen-reader sessions, browser-native 200% zoom, physical-device accessibility and exhaustive compliance **Not verified** |
| Layout — Checked | DOM form order, shared edges and breakpoint source review; production screenshots at 320/390/1440 plus interaction inspection at 780; both network first screens at 390; no sampled overflow/overlap/clipping; long full prices wrap | Native zoom, RTL mirror and translated expansion **Not verified**; no localization variants are implemented |
| Writing — Checked | Action labels, nearby price guidance, total-supply definition, source/time labels, explicit manual mode, quote-error recovery and irreversible-liquidity explanation; 29 prose words on first 390 Ethereum screen | No copy audit of arbitrary onchain token names or external provider errors; those are external content |
| Typography — Checked | Existing local DM Sans loaded; six size roles and three weights; full addresses/prices wrap, tabular numbers; probe measured five sizes at 390 and six at 1440; mobile inputs remain 16 px | Extreme text enlargement and every possible token-name/script combination **Not verified** |
| Colors — Checked | Existing semantic tokens retained; selected option has native checked state plus border/background; error/success have text/icons; resolved solid pairs measured in `contrast.json`; both probes passed text contrast | Image/alpha-overlay contrast in every state **Not verified**; dark theme **Not applicable**, light-only product |
| UI — Checked | Native controls, hover/focus/selected/disabled/loading/error/manual/review states; 48 px cap labels and 44 px refresh; one primary action; restrained 150 ms transitions and reduced-motion guard; no nested-card/border-plus-shadow probe failures | Browser Animations-panel replay at 10% speed **Not verified**; no staged entrance or theme-transition system exists |

Measured resolved pairs include text/page **13.32:1**, muted/page **5.41:1**, muted/preview **5.07:1**, white/primary **5.28:1**, accent/page **4.84:1**, focus/white **6.09:1** and error/error-background **6.27:1**. The probe reported 11 compact entry controls below the comfortable 44 px size, but all met its 24 px/spacing rule. Market-cap options are 48 px; the new select and refresh are at least 44 px. No sampled required contrast/spacing failure remains.

## Findings, fixes and rechecks

Locations refer to final source; the behavior described under “Before” was corrected in this revision.

| Severity / source | Before and user impact | Correction and recheck |
| --- | --- | --- |
| High · `src/networks.ts:38`, `src/config.ts:12`, `src/transactions.tsx:34` | Ethereum-only addresses/chain plumbing could not serve Robinhood and used the old launch hook | Centralized per-chain contracts/bases/RPCs; all reads, simulations, switches and writes use selected chain. Supplied address/getter checks and Robinhood encoding scenario passed |
| High · `src/chain.ts:52`, `src/chain.ts:245` | Simply replacing the accepted hook would strand existing Ethereum token details/discovery | Accept configured plus previous mainnet hook; existing-token actions use actual token hook. Live legacy-token detail/owner and discovery scenarios passed |
| Medium · `src/StartingPrice.tsx:123`, `src/pricing.ts:48` | Raw base-units entry made starting value difficult to choose | Four labelled market-cap radios, quote provenance, exact integer conversion, factory-aligned preview, manual recovery. Math tests and all cap/supply/base interaction scenarios passed |
| Medium · `src/styles.css:2474` | The narrow network control clipped “Robinhood” on mobile; connected header could crowd | 120 px mobile native select, smaller utility gap, decorative wallet icon omitted, separate utility row ≤350 px. Rechecked 320/390 and both 16/16 probes |
| High · `src/transactions.tsx:69`, `src/Create.tsx:352`, `src/Token.tsx:402` | A reviewed quote could age while asynchronous preflight/simulation was running | Freeze review price and enforce freshness again immediately before wallet request. Expired-review scenario passed with no signing request |
| Medium · `src/Create.tsx:171`, `src/StartingPrice.tsx:35` | Keeping Create mounted for draft preservation could keep hidden quote polling active | Enable quote fetching only on active launch editing and stop periodic refresh on review. Source checked and final navigation/quote suite passed |
| Medium · `src/styles.css:2453` | Exact calculated prices can exceed narrow control width | Wrap complete price and review values without ellipsis. Final mobile pricing screenshot and responsive scenario passed |

No unresolved high/medium defect was observed within the tested scope. External service limits and unperformed checks remain explicitly below.

## Rendered evidence

- [launch-mobile.png](launch-mobile.png): Ethereum first screen at 390×844 CSS px; probe capture uses 2× device pixels.
- [robinhood-mobile.png](robinhood-mobile.png): Robinhood first screen at the same size; product and action visible.
- [launch-desktop.png](launch-desktop.png): 1440 px desktop workspace.
- [marketcap-mobile.png](marketcap-mobile.png): live ETH quote, full calculated price, native ~$1m radio focus after keyboard selection; 390 px viewport scrolled to the pricing controls.
- [webkit-review.png](webkit-review.png): WebKit mobile review from the deterministic-price interaction run.
- [design-probe.json](design-probe.json): portable summary of both actual 16/16 probe runs.

Screenshots were inspected, not merely saved. The final MCP console inspection returned zero messages/errors/warnings and the browser was closed. The preview was local validation only; no publication ran.

## Remaining limits

No real signature, funded deployment, receipt lifecycle, Coinbase passkey session or physical wallet-app handoff was tested. RPC/API access is required for live data. Robinhood's discovery index answered Cloudflare 403 during research, so live event indexing there is not claimed as verified; the failure state, retry and direct-address path remain available. DexScreener timestamps indicate when the response was fetched, not the last trade, and deepest positive liquidity does not ensure an unmanipulated quote. Factory tick alignment and later trades can change valuation. The browser-suite JSON's empty `limitations` array means no harness step was skipped; it does not supersede these product and verification limits.

The final README and DESIGN document the delivered source. Documentation and evidence changes after the last application build do not change the runtime export. Packaging inventory, unchanged forbidden paths, local asset resolution and byte budget are recorded separately in `package-check.json`.
