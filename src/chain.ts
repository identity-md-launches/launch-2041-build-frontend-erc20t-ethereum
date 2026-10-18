import {
  decodeEventLog,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { publicClient } from "./config";
import { activeChain, NETWORK, supportedHooks } from "./networks";
import {
  BASES,
  CONTRACTS,
  factoryAbi,
  hookAbi,
  tokenAbi,
  NATIVE_ETH,
  type BaseToken,
} from "./contracts";
export type LaunchPreview = {
  creatorSupply: bigint;
  lpSupply: bigint;
  sqrtPriceX96: bigint;
  tickLower: number;
  tickUpper: number;
  effectivePriceWei: bigint;
};
export type TokenInfo = {
  address: Address;
  hook: Address;
  name: string;
  symbol: string;
  owner: Address;
  totalSupply: bigint;
  quoteToken: Address;
  launched: boolean;
  launchedAt: bigint;
  restingTaxBps: number;
  taxBps: number;
  launchTaxBps: number;
  taxDecayIntervalSeconds: number;
  taxDecayActive: boolean;
  feeRecipient: Address;
  feeDecayRecipient: Address;
  externalLiquidityEnabled: boolean;
  pairingEnabled: boolean;
  useGlobalDistributors: boolean;
  reserve: bigint;
  block: bigint;
  checkedAt: number;
};
export async function readToken(address: Address): Promise<TokenInfo> {
  const block = await publicClient.getBlockNumber({ cacheTime: 0 });
  const code = await publicClient.getCode({ address, blockNumber: block });
  const cloneHook = `0x${code?.slice(92, 132)}`.toLowerCase() as Address;
  const expected = `0x363d3d373d3d3d363d73${CONTRACTS.implementation.slice(2)}5af43d82803e903d91602b57fd5bf3${cloneHook.slice(2)}`;
  if (
    !code?.toLowerCase().startsWith(expected) ||
    code.length !== 292 ||
    !supportedHooks.includes(cloneHook)
  )
    throw new Error(
      "This address is not an ERC20T clone using the specified implementation and shared hook.",
    );
  const fields = [
    "name",
    "symbol",
    "owner",
    "totalSupply",
    "quoteToken",
    "launched",
    "launchedAt",
    "restingTaxBps",
    "taxBps",
    "launchTaxBps",
    "taxDecayIntervalSeconds",
    "taxDecayActive",
    "feeRecipient",
    "feeDecayRecipient",
    "externalLiquidityEnabled",
    "pairingEnabled",
    "useGlobalDistributors",
  ] as const;
  const values = await publicClient.multicall({
    contracts: [
      ...fields.map((functionName) => ({
        address,
        abi: tokenAbi,
        functionName,
      })),
      { address, abi: tokenAbi, functionName: "balanceOf", args: [address] },
    ],
    allowFailure: false,
    blockNumber: block,
  });
  return {
    address: getAddress(address),
    hook: cloneHook,
    ...Object.fromEntries(fields.map((field, i) => [field, values[i]])),
    reserve: values[fields.length],
    block,
    checkedAt: Date.now(),
  } as TokenInfo;
}
export async function eligibleBase(
  address: Address,
  hook: Address = CONTRACTS.hook,
): Promise<BaseToken> {
  if (address.toLowerCase() === NATIVE_ETH) return BASES[0];
  const known = BASES.find((b) => b.address === address.toLowerCase());
  const [status, metadata] = await Promise.all([
    publicClient.readContract({
      address: hook,
      abi: hookAbi,
      functionName: "externalBases",
      args: [address],
    }) as Promise<[boolean, boolean]>,
    known
      ? Promise.resolve([known.symbol, known.name, known.decimals])
      : publicClient.multicall({
          contracts: ["symbol", "name", "decimals"].map((functionName) => ({
            address,
            abi: erc20Abi,
            functionName,
          })),
          allowFailure: false,
        }),
  ]);
  if (status[0]) {
    if (!status[1])
      throw new Error(
        "This base is registered, but new launches are currently disabled by the hook owner.",
      );
  } else {
    const token = await readToken(address);
    const initialized = await publicClient.readContract({
      address: hook,
      abi: hookAbi,
      functionName: "poolInitialized",
      args: [address],
    });
    if (
      token.hook.toLowerCase() !== hook.toLowerCase() ||
      !token.launched ||
      !initialized ||
      token.quoteToken.toLowerCase() !== NATIVE_ETH ||
      !token.pairingEnabled
    )
      throw new Error(
        "Choose an enabled external base or a launched, ETH-paired ERC20T with pairing enabled.",
      );
  }
  return {
    address: getAddress(address),
    symbol: String(metadata[0]),
    name: String(metadata[1]),
    decimals: Number(metadata[2]),
  };
}
export async function previewLaunch(
  supply: bigint,
  allocationBps: number,
  price: bigint,
  currency0 = false,
): Promise<LaunchPreview> {
  return (await publicClient.readContract({
    address: CONTRACTS.factory,
    abi: factoryAbi,
    functionName: "previewQuotedLaunch",
    args: [supply, allocationBps, price, currency0],
  })) as LaunchPreview;
}
export async function verifyInfrastructure(hook: Address = CONTRACTS.hook) {
  const result = await publicClient.multicall({
    contracts: [
      {
        address: CONTRACTS.factory,
        abi: factoryAbi,
        functionName: "implementation",
      },
      { address: hook, abi: hookAbi, functionName: "poolManager" },
      {
        address: CONTRACTS.positionManager,
        abi: tokenAbi,
        functionName: "poolManager",
      },
      {
        address: CONTRACTS.positionManager,
        abi: tokenAbi,
        functionName: "permit2",
      },
    ],
    allowFailure: false,
  });
  const expected = [
    CONTRACTS.implementation,
    CONTRACTS.poolManager,
    CONTRACTS.poolManager,
    CONTRACTS.permit2,
  ];
  if (hook.toLowerCase() === CONTRACTS.hook) {
    const registry = await publicClient.readContract({
      address: hook,
      abi: hookAbi,
      functionName: "globalDistributorRegistry",
    });
    if (String(registry).toLowerCase() !== CONTRACTS.globalDistributorRegistry)
      throw new Error(
        "The hook’s distributor registry does not match this network’s configuration.",
      );
  }
  if (result.some((v, i) => String(v).toLowerCase() !== expected[i]))
    throw new Error(
      "The deployed infrastructure does not match this app’s verified configuration.",
    );
}
export type DiscoveryPage = {
  addresses: Address[];
  next: Record<string, string | number> | null;
};
export async function discoverTokens(
  page?: Record<string, string | number> | null,
): Promise<DiscoveryPage> {
  const query = page
    ? "?" +
      new URLSearchParams(
        Object.entries(page).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(
    `${NETWORK.indexUrl}/api/v2/addresses/${CONTRACTS.factory}/logs${query}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok)
    throw new Error(
      "The deployment index is unavailable. Retry, or open a token by its address.",
    );
  const data = (await res.json()) as {
    items: { data: Hex; topics: Hex[] }[];
    next_page_params: Record<string, string | number> | null;
  };
  const addresses = new Set<Address>();
  for (const item of data.items) {
    try {
      const log = decodeEventLog({
        abi: factoryAbi,
        data: item.data,
        topics: item.topics as [Hex, ...Hex[]],
      });
      const args = log.args as { token?: Address; hook?: Address };
      if (
        log.eventName === "TokenCreated" &&
        args.token &&
        supportedHooks.includes(args.hook?.toLowerCase() || "")
      )
        addresses.add(getAddress(args.token));
    } catch {
      /* Other factory log types do not describe token deployments. */
    }
  }
  return { addresses: [...addresses], next: data.next_page_params };
}
export const isTokenAddress = (value: string): value is Address =>
  isAddress(value) && value.toLowerCase() !== NATIVE_ETH;
export const explorer = (address: string) =>
  `${activeChain.blockExplorers.default.url}/address/${address}`;
export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
