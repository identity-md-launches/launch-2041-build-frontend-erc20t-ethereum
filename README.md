# ERC20T

A static Ethereum mainnet frontend for creating tokens with a shared Uniswap v4 tax hook. The submission includes the production export in **`dist/`**, React/TypeScript source, full verified contract ABIs, and a dependency lockfile.

[Mobile screenshot](artifacts/launch-mobile.webp) · [Desktop screenshot](artifacts/launch-desktop.webp) · [Design system](DESIGN.md) · [Validation report](artifacts/validation.md) · [Contract research](artifacts/contract-research.md)

## Install, preview, and rebuild

Use Node.js **22.12 or later** and npm. No environment file, private key, API key, backend, or WalletConnect project ID is needed.

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Open the local URL printed by Vite. For development, use `npm run dev`. To preview the delivered export without installing dependencies, serve `dist/` with any static HTTP server, for example:

```sh
python3 -m http.server 4173 --directory dist
```

The host serves the contents of `dist/`. Vite uses `base: './'`; scripts, CSS, fonts, icons, favicon, and the share image resolve relative to the export. Hash routing works at a gateway subpath without server-side rewrites. Opening `index.html` using `file://` is not a supported ESM preview method. No publication command is needed or included.

The optional `scripts/staged-build.sh` copies source to an external build directory, runs the typecheck/build there, and copies the finished export back. Install this project's lockfile in that directory first. The script defaults to `/tmp/erc20t-build`; `ERC20T_BUILD_DIR` can override it. This was used for the assignment to keep all dependency directories outside the repository.

## What works

- **Create:** name, symbol, fixed supply; deploy and launch in one transaction or deploy first; ETH, IMD, FWA, and a checked custom eligible base; starting price; 0–20% creator allocation; 0.3–5% resting tax; optional 99% launch decay; separate recipient settings; onchain price preview; explicit final review.
- **Explore:** paginated factory deployments, search, base/status filters, refresh, and direct token-address lookup. Tokens and tax rates are read from Ethereum; no demonstration tokens or invented market statistics are shipped.
- **Manage:** filter loaded deployments to the connected owner, launch a deployed token later, change regular/decay recipients, resting tax, local/global distributor permissions, external liquidity, and pairing permission.
- **Wallets:** named EIP-6963 browser wallets, a browser fallback, Coinbase Wallet/Smart Wallet, and four mobile in-app links. Wrong-chain switching, disconnect, and rejection messages are implemented.
- **Transactions:** mainnet simulation before signing, fresh ownership/eligibility checks, zero base deposit, duplicate-request protection, pending/confirmed/reverted states, cancellation recovery, receipt rechecks, and Etherscan links. Only the visitor's wallet can sign.

The default recipient is the actually connected wallet, not an embedded owner address. A custom recipient must be entered by the visitor. Native ETH's zero-address currency sentinel is the verified contract convention and is never used as a recipient.

## Routes and source

| Route / source | Purpose |
| --- | --- |
| `#/create` · `src/Create.tsx` | Launch workspace and review |
| `#/explore` · `src/Explore.tsx` | Discovery and filters |
| `#/manage` · `src/Explore.tsx` | Connected owner's loaded tokens |
| `#/token/<address>` · `src/Token.tsx` | Live tax information and owner controls |
| `#/how-it-works` · `src/App.tsx` | Economics, transfer rules, and verified addresses |
| `src/contracts/` | Full ABIs, verified addresses, base definitions |
| `src/chain.ts` | Contract reads, clone verification, eligibility, index pagination |
| `src/transactions.tsx` | Simulation, wallet requests, and receipts |
| `src/model.ts` | Exact unit parsing, allocation, validation, and configuration |
| `src/config.ts`, `src/wallet.tsx` | RPC fallback and wallet connections |
| `src/styles.css`, `src/ui.tsx` | Implemented design tokens and shared components |

## Checks actually run

The final source/export was checked on 2026-10-17:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed, TypeScript exit 0 |
| `npm run build` | Passed, Vite exit 0; complete relative-path export |
| `npm test` | **11/11** unit and ABI encoding tests passed |
| `npm run validate` | **16/16** production browser scenarios passed in Chromium and WebKit |
| Automated accessibility scans | **0 violations** in five sampled WCAG A/AA states |
| Pinned `taste@1` probe | **16/16** checks passed at 320, 390, and 1440 px |
| Live contract checks | **13/13** read-only simulations passed; ETH/IMD/FWA deployment and atomic launch, plus seven owner methods |
| First mobile screen | At 390×844, the product and “Continue to launch” are visible; button bottom measured at 814.66 px |

The browser script starts and closes its own local static server at a subpath. To run it locally:

```sh
npx playwright install chromium webkit
npm run validate
npm test
npm run check:contracts
```

Linux may need Playwright's documented browser system dependencies. During this assignment, missing WebKit libraries and its TLS module were installed in temporary tooling directories; no system packages or browser binaries are included in the submission. The pinned probe was run with its Playwright module path explicitly supplied. See [validation](artifacts/validation.md) for evidence, environment workarounds, fixes, and the six-domain review.

`npm run check:contracts` only uses `eth_call` simulations and reads. `npm run validate` uses a synthetic EIP-6963 provider for wallet-specific tests; it obtains a **public onchain owner address** and rejects every signing request. Neither script broadcasts transactions. Check outputs go under `test/scratch/`, which is excluded from submission.

`npm run share` regenerates `public/share.png` using the local font and code-drawn brand artwork; rebuild afterwards to update `dist/`.

## Practical limits

- No funded mainnet deployment, wallet signature, mined transaction lifecycle, or real Coinbase passkey session was performed. Simulation success is not a guarantee of later execution. Actual mobile app handoffs need installed wallet apps and were not tested on physical devices.
- Public RPC and Blockscout availability/rate limits can affect reads. Discovery is the set of loaded factory-event pages, not an exhaustive global token directory. Direct address lookup remains available when the index is down.
- Token details refresh every 12 seconds and discovery reads every 30 seconds. These are block observations, not continuously guaranteed quotes. An unsuccessful refresh is labelled; cached values are not presented as newly read.
- This is a token launch and management app. It explains exact-input-only swaps but does not include a trading router or protocol-owner administration for registering base conversion pools.
- Launch settings are retained while navigating within the mounted app, but are not saved as drafts across reloads. Wallet reconnection uses wagmi storage. Pending transactions can always be inspected via the displayed explorer link; there is no backend transaction history.
- Vite reports a bundle-size advisory for the main wallet/Ethereum application chunk (about 708 kB raw, 207 kB gzip). The complete export is under 1 MiB. No unnecessary archives or dependency caches are included.
- Screen-reader sessions, native browser 200% zoom, physical devices, and exhaustive accessibility compliance were not verified. Automated scans and responsive screenshots are narrower checks.

## Attribution and packaging

DM Sans is bundled under the SIL Open Font License in `public/fonts/OFL.txt`. Wallet marks are from RainbowKit with its MIT license in `public/wallets/LICENSE.txt`; Lucide supplies interface icons. The token illustration and share composition are code-drawn for this site.

The pinned Better Interface guidance (Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and documentation method adapted from [Impeccable](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md) (Paul Bakaus, Apache-2.0) informed the implementation and review. Their supplied combined license is retained in `artifacts/licenses/design-guidance.txt`.

[Path budgets](artifacts/path-budget.md) explicitly cover `.gitignore`. Dependency, cache, browser, and scratch directories are excluded at every nesting level. `dist/` is intentionally included alongside source and the lockfile. `.git/`, `.github/`, and `.env` files are not modified.

The [packaging audit](artifacts/package-check.json) records the complete export inventory and final path sizes. The deliverable is below 2 MiB uncompressed, within the 8 MiB submission ceiling.
