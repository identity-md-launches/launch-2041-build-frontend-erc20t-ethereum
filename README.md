# ERC20T

A token launch console for **Ethereum and Robinhood Chain**, using a shared Uniswap v4 tax hook. Choose an approximate starting market cap; the app calculates the base-token starting price. The delivery contains React/TypeScript source, the existing dependency lockfile, and the complete static export in **`dist/`**.

[Ethereum mobile](artifacts/launch-mobile.png) · [Robinhood mobile](artifacts/robinhood-mobile.png) · [Market-cap controls](artifacts/marketcap-mobile.png) · [Desktop](artifacts/launch-desktop.png) · [Design system](DESIGN.md) · [Validation](artifacts/validation.md) · [Contract research](artifacts/contract-research.md)

## Install, preview and rebuild

Use Node.js **22.12 or later** and npm. No environment file, private key, API key, backend or WalletConnect project ID is required.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open Vite's printed local URL. Development uses `npm run dev`. To serve the delivered export without installing build dependencies:

```sh
python3 -m http.server 4173 --directory dist
```

Serve the contents of `dist/`. The existing Vite configuration uses `base: './'`; all required runtime assets are local and resolve relative to the export. Hash routes work at gateway subpaths without server rewrites. Use an HTTP server to preview ESM modules.

For an isolated build that keeps dependencies outside the repository:

```sh
mkdir -p /tmp/erc20t-build
cp package.json package-lock.json /tmp/erc20t-build/
npm --prefix /tmp/erc20t-build ci --cache /tmp/erc20t-npm-cache
bash scripts/staged-build.sh
```

That unchanged script copies current source/assets into `/tmp/erc20t-build`, runs typecheck and production build, then replaces `dist/` with the result. `ERC20T_BUILD_DIR` optionally selects another external build directory. Retain the complete export when delivering an update. Hosting/publication is outside this repository workflow.

## Networks and launch pricing

The header selector is available on phones and desktop. Ethereum is the default; the Robinhood version is `?network=robinhood#/create`. For a subpath, use `/subpath/?network=robinhood#/create`. Chain selection reloads the app, clearing unsigned drafts, query caches and review approvals. A token-detail route changes to Explore when selecting another chain. Wallets switch to the selected network before signing.

`src/networks.ts` contains the supplied factory, hook, implementation and registry addresses. New Ethereum tokens use hook `0x05e1934d8B52a8dED4F3F42AA9a7a12244192544`; existing tokens using the previous hook remain readable and manageable with their own hook. Robinhood uses chain **4663** and its distinct contracts. Ethereum offers ETH, IMD and FWA. Robinhood offers ETH and its independently verified, registered IMD token. A Robinhood FWA address was not supplied or verified, so it is not guessed; other eligible bases can be entered by address.

Both atomic launches and deferred owner launches offer **~$50k / $150k / $500k / $1m**, defaulting to ~$150k. The target is fully diluted valuation: **total supply, including the creator allocation**, rather than only the liquidity reserve. The app performs the calculation locally with BigInt before calling the existing contract preview and launch methods:

```text
token USD price = target market cap / whole-token total supply
base per token = token USD price / base USD price
atomic starting price = ceil(targetUSD × 10^(36 + baseDecimals)
                            / (supplyAtomic18 × baseUSD18))
```

For example, a $150,000 target with one billion tokens and ETH at $2,500 gives **0.00000006 ETH per token**. The factory then aligns that price to a pool tick; review displays the effective price and approximate resulting valuation. This does not raise the selected amount of money or guarantee later trading value. No base-token deposit is required; network gas still applies.

ETH/USD comes from CoinGecko with its update timestamp. IMD/FWA and other ERC20 quotes come from DexScreener: the exact base-token address and selected chain must match, and the positive-liquidity quoted pair with the greatest USD liquidity is chosen. Each quote shows its source and time. DexScreener's time is the response fetch time, **not a verified last-trade timestamp**. Quotes refresh every minute while editing; reviewed prices stay fixed. Quotes older than five minutes are rejected before review, during preflight and immediately before requesting a signature. If pricing is unavailable, retry or explicitly choose **Enter a manual price**; no substitute quote is shipped.

## Existing functionality retained

- **Create:** fixed supply, deploy and launch together or deploy first, eligible base checks, 0–20% creator allocation, 0.3–5% resting tax, optional 99% launch decay, recipient settings, live contract preview and final acknowledgement.
- **Explore/manage:** paginated factory events, search and filters, direct token lookup, current chain/tax information and owner-only launch, fee, distributor, liquidity and pairing controls.
- **Wallets:** EIP-6963 browser-wallet discovery, injected fallback, Coinbase Wallet/Smart Wallet and mobile wallet-browser links behind one connect control.
- **Transactions:** selected-chain simulation and infrastructure checks before signing, refreshed ownership/eligibility, duplicate prevention, rejected/pending/confirmed/reverted handling, receipt rechecks and chain-specific explorer links.

Recipients default to the visitor's connected account. Custom recipients must be entered by the visitor. Native ETH's zero-address currency identifier is a contract convention; it is never used as a recipient.

## Source map

| Source | Purpose |
| --- | --- |
| `src/networks.ts`, `src/config.ts` | Network contracts, bases, RPCs and wallet chains |
| `src/pricing.ts`, `src/StartingPrice.tsx` | Quotes, integer conversion and shared pricing controls |
| `src/Create.tsx`, `src/Token.tsx` | Atomic creation and deferred owner-launch flows |
| `src/Explore.tsx`, `src/chain.ts` | Discovery, token verification, eligibility and reads |
| `src/transactions.tsx`, `src/wallet.tsx` | Simulation, signing, receipts and connection UI |
| `src/model.ts`, `src/contracts/` | Validation, exact units, configuration and contract ABIs |
| `src/App.tsx`, `src/ui.tsx`, `src/styles.css` | Routes, guide, shared controls and design system |

Routes: `#/create`, `#/explore`, `#/manage`, `#/token/<address>`, and `#/how-it-works`.

## Checks actually run

Final source/export validation on **2026-10-18**:

| Check | Result |
| --- | --- |
| Typecheck and production build, through `bash scripts/staged-build.sh` | Both passed, exit 0 |
| `npm test` | **18/18** math, validation and ABI tests passed |
| `npm run validate` | **21/21** production browser scenarios passed, Chromium and WebKit |
| Automated accessibility | **0 violations** in seven sampled axe states |
| Pinned `taste@1` | **16/16 Ethereum**, **16/16 Robinhood**, at 320/390/1440 px |
| `npm run check:contracts` | **47/47** live read-only checks across both chains |
| Mobile first screen | Product/form and primary action visible at 390×844 on both networks; button bottom 814.66 CSS px |

The [validation report](artifacts/validation.md) records commands, evidence, fixes and the six-domain Better Interface review. [Interaction results](artifacts/interactions.json) and [contract results](artifacts/live-contract-checks.json) retain the actual checks. The browser script manages its own temporary subpath server and closes it afterwards. To reproduce locally after installing dependencies:

```sh
npx playwright install chromium webkit
npm test
npm run validate
npm run check:contracts
```

Playwright's Linux system dependencies may also be needed. Missing WebKit libraries were provided in temporary external tooling directories for this run; the actual WebKit flow passed. No browser binaries or dependencies are delivered. Tests use deterministic quote responses for exact arithmetic, a synthetic EIP-6963 wallet that rejects signing, and an explicitly simulated unlaunched owner state. Factory previews and other RPC reads remain live. These fixtures do not establish funded deployment success.

`npm run share` regenerates `public/share.png` using the bundled font and code-drawn artwork; rebuild afterwards to update the export.

## Practical limits

- No signature, funded deployment, broadcast, mined transaction lifecycle, real Coinbase passkey session or physical mobile-wallet handoff was performed. Successful read-only simulation does not guarantee future execution.
- RPC, CoinGecko, DexScreener and explorer availability can interrupt reads. Robinhood's Blockscout API returned Cloudflare **403** during research; retry and direct token lookup remain available. Discovery covers loaded event pages, not an exhaustive directory.
- USD prices are indicative third-party quotes. Positive liquidity is not a guarantee against stale or manipulated market prices. The app shows sources, freezes review inputs and provides a manual fallback.
- Token details refresh every 12 seconds and discovery every 30 seconds. Cached chain observations are labelled; they are not price guarantees. Drafts survive in-app navigation but not a reload/network change. There is no backend transaction history.
- Screen-reader sessions, browser-native 200% zoom, translations/RTL, physical devices and exhaustive accessibility compliance were not verified.
- Vite reports a bundle-size advisory for the main wallet/application chunk (**720.21 kB raw, 211.09 kB gzip**); the build passes. The complete export is about 1 MiB. See the [packaging audit](artifacts/package-check.json) for exact sizes and inventory.

## Attribution and delivery

DM Sans is bundled under the SIL Open Font License (`public/fonts/OFL.txt`). Wallet marks retain their MIT license (`public/wallets/LICENSE.txt`); interface icons use Lucide. Brand illustrations and the share composition are code-drawn.

The pinned Better Interface guidance (Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and documentation method adapted from [Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Paul Bakaus, Apache-2.0) informed implementation and review. The combined supplied license is retained in [artifacts/licenses/design-guidance.txt](artifacts/licenses/design-guidance.txt).

The [path budget](artifacts/path-budget.md) explicitly covers the `.gitignore` evidence-directory inclusion. Dependency/cache exclusions remain active at every nesting level. The delivery retains the existing package manifest/lockfile and build configuration, includes `dist/`, and fits the **8 MiB** ceiling. Nothing is published or deployed by this task.
