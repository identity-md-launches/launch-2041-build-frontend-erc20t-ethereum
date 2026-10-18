# Network and contract verification

Checked 2026-10-18. This update changes frontend configuration and pricing; it deploys or modifies no contracts. All contract checks were reads or `eth_call` simulations. No private account or signer was used.

## Requested contracts

| Role | Ethereum (1) | Robinhood Chain (4663) |
| --- | --- | --- |
| Hook | `0x05e1934d8B52a8dED4F3F42AA9a7a12244192544` | `0x6E582dCDbB21902080124FC677Db1eD8C1596544` |
| Factory | `0x801411c6aCeC4Fa80c75c5d3C0eAe13C84f8a173` | `0x04C8bA34CB3FD5AF9db06B8a25Eaf1c8Fb1ce738` |
| Token implementation | `0x2df7DCf4D19a7924e00AE96629CC1d1261670eEe` | `0x6b8E414bbBAd57a9bA1c3828156C56BbCFE2aC8e` |
| Global distributor registry | `0xDf99bd1218E7EB288CfFeCF9775385167Bb09B2D` | `0x00Df51C981193C701658f3a54AF4E256d752d17D` |

These values were supplied by the requester and are represented in `src/networks.ts`. RPC sources named by the site are [Ethereum PublicNode](https://ethereum-rpc.publicnode.com) and [Robinhood PublicNode](https://robinhood-rpc.publicnode.com), with public fallbacks. Read-only getter checks confirmed the factory implementation and the hook registry against those values. Bytecode exists at every configured infrastructure address. This is runtime verification, not a source-code audit of the new hook; explorer source verification was not established.

The previous Ethereum hook, `0xed9a04fa6693e754661a22502524df9b1857e544`, remains an accepted hook for existing token clones and discovery. New deployments exclusively use the new hook. Existing-token owner methods use the token's actual hook; registry matching applies to the new configured hook.

## Robinhood infrastructure and bases

Chain metadata was looked up in [Chainlist's chain data](https://chainid.network/chains.json): chain ID 4663, Ether as native currency, mainnet RPC and Blockscout explorer. Uniswap v4 infrastructure was looked up in the [Uniswap deployment reference](https://docs.uniswap.org/contracts/v4/deployments) and then cross-checked through onchain getters:

- Pool manager: `0x8366a39cc670b4001a1121b8f6a443a643e40951`.
- Position manager: `0x58daec3116aae6d93017baaea7749052e8a04fa7`.
- Permit2: `0x000000000022d473030f116ddee9f6b43ac78ba3`.

The hook and position manager identify the same pool manager; the position manager identifies the configured Permit2. The factory's implementation getter matches the requested implementation.

Robinhood IMD is `0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127`. The hook's `externalBases` getter returned registered/enabled, and token getters returned `IMD` and 18 decimals. It is distinct from Ethereum IMD. No verified Robinhood FWA address was provided or found, so only ETH and verified IMD are presets there; custom eligible bases remain possible by address. Ethereum's existing IMD and FWA addresses were retained and their eligibility/metadata checked against the new hook.

## Evidence and limits

[live-contract-checks.json](live-contract-checks.json) records **47 passing checks**: 26 Ethereum and 21 Robinhood. The observed starting blocks were **26221051** and **91959874** respectively; calls were live observations during the run, not all pinned to a single immutable block. Checks cover infrastructure, configured ERC20 base eligibility/metadata, both currency-order price previews, deploy-only and atomic-launch simulations for every configured base. Deterministic USD inputs isolate conversion and alignment behavior; they are not published as live market prices.

The RPC scripts use the hook's public onchain owner only as an `eth_call` sender. They cannot establish future execution, mined receipts, third-party service uptime or contract safety. Robinhood's Blockscout API returned Cloudflare 403 during direct research; the UI reports index failure and retains retry/direct lookup. No claim is made that live Robinhood event discovery was fully verified.
