import { defineChain, type Address } from "viem";
import { mainnet } from "viem/chains";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  contracts: {
    multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});
export type BaseToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
};
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;
const ether: BaseToken = {
  symbol: "ETH",
  name: "Ether",
  address: NATIVE_ETH,
  decimals: 18,
};
const permit2 = "0x000000000022d473030f116ddee9f6b43ac78ba3" as const;
export const NETWORKS = {
  ethereum: {
    chain: mainnet,
    label: "Ethereum",
    rpcUrls: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    indexUrl: "https://eth.blockscout.com",
    dexChain: "ethereum",
    contracts: {
      factory: "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
      hook: "0x05e1934d8b52a8ded4f3f42aa9a7a12244192544",
      implementation: "0x2df7dcf4d19a7924e00ae96629cc1d1261670eee",
      globalDistributorRegistry: "0xdf99bd1218e7eb288cffecf9775385167bb09b2d",
      poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
      positionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
      permit2,
    },
    legacyHooks: ["0xed9a04fa6693e754661a22502524df9b1857e544"],
    bases: [
      ether,
      {
        symbol: "IMD",
        name: "Identity.md",
        address: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
        decimals: 18,
      },
      {
        symbol: "FWA",
        name: "Fake World Assets",
        address: "0xa0df17b5ac76ababa36e1450e2cbcd18a620c845",
        decimals: 18,
      },
    ] as BaseToken[],
  },
  robinhood: {
    chain: robinhood,
    label: "Robinhood",
    rpcUrls: [
      "https://robinhood-rpc.publicnode.com",
      "https://rpc.mainnet.chain.robinhood.com",
    ],
    indexUrl: "https://robinhoodchain.blockscout.com",
    dexChain: "robinhood",
    contracts: {
      factory: "0x04c8ba34cb3fd5af9db06b8a25eaf1c8fb1ce738",
      hook: "0x6e582dcdbb21902080124fc677db1ed8c1596544",
      implementation: "0x6b8e414bbbad57a9ba1c3828156c56bbcfe2ac8e",
      globalDistributorRegistry: "0x00df51c981193c701658f3a54af4e256d752d17d",
      poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
      positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
      permit2,
    },
    legacyHooks: [],
    // This IMD address is registered and enabled in Robinhood's hook. FWA has
    // no supplied/verified Robinhood deployment; it is not copied from Ethereum.
    bases: [
      ether,
      {
        symbol: "IMD",
        name: "Identity.md",
        address: "0x5f7bb59365ce557c26dbcaa4ee9d39a4b95b7127",
        decimals: 18,
      },
    ] as BaseToken[],
  },
} as const;
export type NetworkKey = keyof typeof NETWORKS;
export const networkKey: NetworkKey =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).get("network") === "robinhood"
    ? "robinhood"
    : "ethereum";
// Selection is immutable for a page session. Changing network reloads the app,
// clearing queries, review approvals, and unsigned requests from the other chain.
export const NETWORK = NETWORKS[networkKey];
export const activeChain = NETWORK.chain;
export const supportedHooks: readonly string[] = [
  NETWORK.contracts.hook,
  ...NETWORK.legacyHooks,
];
