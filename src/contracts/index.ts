import { parseAbiItem, type Abi } from "viem";
import factory from "./factory.json";
import hook from "./hook.json";
import token from "./token.json";
export const factoryAbi = factory as Abi;
export const hookAbi = [
  ...hook,
  parseAbiItem("function globalDistributorRegistry() view returns (address)"),
] as Abi;
export const tokenAbi = token as Abi;
export const tokenCreatedEvent = parseAbiItem(
  "event TokenCreated(address indexed token, address indexed owner, address indexed creator, address hook)",
);
export { NATIVE_ETH, type BaseToken } from "../networks";
import { NETWORK } from "../networks";
export const CONTRACTS = NETWORK.contracts;
export const BASES = NETWORK.bases;
