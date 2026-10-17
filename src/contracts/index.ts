import { parseAbiItem, type Abi, type Address } from "viem";
import factory from "./factory.json";
import hook from "./hook.json";
import token from "./token.json";
export const factoryAbi = factory as Abi;
export const hookAbi = hook as Abi;
export const tokenAbi = token as Abi;
export const tokenCreatedEvent = parseAbiItem(
  "event TokenCreated(address indexed token, address indexed owner, address indexed creator, address hook)",
);
export const CONTRACTS = {
  factory: "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
  hook: "0xed9a04fa6693e754661a22502524df9b1857e544",
  implementation: "0x2df7dcf4d19a7924e00ae96629cc1d1261670eee",
  poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
  positionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
} as const satisfies Record<string, Address>;
export const DEPLOYMENT_BLOCK = 26208074n;
// Native ETH is represented by address(0) in the verified contracts, not a recipient.
export const NATIVE_ETH = "0x0000000000000000000000000000000000000000" as const;
export const BASES = [
  { symbol: "ETH", name: "Ether", address: NATIVE_ETH, decimals: 18 },
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
] as const;
export type BaseToken = {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
};
