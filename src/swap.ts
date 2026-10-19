import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  maxUint256,
  pad,
  toHex,
  keccak256,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { publicClient } from "./config";
import { CONTRACTS, NATIVE_ETH } from "./contracts";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type Asset = { address: Address; symbol: string; decimals: number };
// A route lists every currency it touches, in order, and the pool for each hop.
export type Route = { assets: Asset[]; pools: PoolKey[] };

const poolKeyTuple = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
export const poolAbi = parseAbi([
  `function poolKey() view returns (${poolKeyTuple})`,
  `function externalBasePool(address base) view returns (${poolKeyTuple})`,
  "function externalBases(address token) view returns (bool registered, bool enabled)",
]);
export const quoterAbi = parseAbi([
  "struct PathKey { address intermediateCurrency; uint24 fee; int24 tickSpacing; address hooks; bytes hookData; }",
  "function quoteExactInput((address exactCurrency, PathKey[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);
export const permit2Abi = parseAbi([
  "function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);

// Universal Router command and v4 router action identifiers.
export const V4_SWAP = "0x10";
const SWAP_EXACT_IN = 0x07;
const SETTLE_ALL = 0x0c;
const TAKE = 0x0e;
const TAKE_ALL = 0x0f;
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
// Empty, keyless addresses used only inside read-only sell simulations.
const SIM_SENDER = "0x5157000000000000000000000000000000000001" as const;
const SIM_RECIPIENT = "0x5157000000000000000000000000000000005157" as const;
const multicallAbi = parseAbi([
  "function getEthBalance(address addr) view returns (uint256 balance)",
]);

export const isEth = (address: string) => address.toLowerCase() === NATIVE_ETH;

export const poolId = (key: PoolKey): Hex =>
  keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );

const normalize = (key: PoolKey): PoolKey => ({
  currency0: getAddress(key.currency0),
  currency1: getAddress(key.currency1),
  fee: Number(key.fee),
  tickSpacing: Number(key.tickSpacing),
  hooks: getAddress(key.hooks),
});

/** The token's own pool, plus the base/ETH pool when the base is not ETH. */
export async function readPools(
  token: Address,
  base: Address,
  hook: Address,
): Promise<{ tokenPool: PoolKey; basePool?: PoolKey }> {
  const tokenPool = normalize(
    (await publicClient.readContract({
      address: token,
      abi: poolAbi,
      functionName: "poolKey",
    })) as PoolKey,
  );
  if (isEth(base)) return { tokenPool };
  const [registered] = (await publicClient.readContract({
    address: hook,
    abi: poolAbi,
    functionName: "externalBases",
    args: [base],
  })) as readonly [boolean, boolean];
  // Registered external bases trade against ETH in a hook-recorded pool;
  // an ERC20T base is itself ETH-paired through its own poolKey.
  const basePool = normalize(
    (registered
      ? await publicClient.readContract({
          address: hook,
          abi: poolAbi,
          functionName: "externalBasePool",
          args: [base],
        })
      : await publicClient.readContract({
          address: base,
          abi: poolAbi,
          functionName: "poolKey",
        })) as PoolKey,
  );
  return { tokenPool, basePool };
}

/** Builds an exact-input route between two assets of this market. */
export function buildRoute(
  from: Asset,
  to: Asset,
  token: Asset,
  base: Asset,
  pools: { tokenPool: PoolKey; basePool?: PoolKey },
): Route {
  const eth: Asset = { address: NATIVE_ETH, symbol: "ETH", decimals: 18 };
  const same = (a: Asset, b: Asset) =>
    a.address.toLowerCase() === b.address.toLowerCase();
  if (isEth(base.address) || same(from, base) || same(to, base))
    return { assets: [from, to], pools: [pools.tokenPool] };
  if (!pools.basePool) throw new Error("The base-token pool is unavailable.");
  // Two hops through the base: ETH → base → token, or token → base → ETH.
  return same(from, token)
    ? { assets: [token, base, eth], pools: [pools.tokenPool, pools.basePool] }
    : { assets: [eth, base, token], pools: [pools.basePool, pools.tokenPool] };
}

const pathKeys = (route: Route) =>
  route.pools.map((pool, i) => ({
    intermediateCurrency: route.assets[i + 1].address,
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: pool.hooks,
    hookData: "0x" as Hex,
  }));

/** Simulated output from Uniswap's V4Quoter, after the hook's tax. */
export async function quoteRoute(route: Route, amountIn: bigint) {
  const { result } = await publicClient.simulateContract({
    address: CONTRACTS.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInput",
    args: [
      {
        exactCurrency: route.assets[0].address,
        path: pathKeys(route),
        exactAmount: amountIn,
      },
    ],
  });
  return result[0];
}

/**
 * Sell-side quote. Uniswap's V4Quoter rejects these pools because the hook
 * alters the input delta, so the real Universal Router call is simulated with
 * eth_simulateV1: an empty, keyless sender is given the input balance and
 * Permit2 allowances in a state override, swaps, and a second call reads what
 * the recipient received. Nothing is signed or broadcast.
 */
export async function simulateSell(route: Route, amountIn: bigint) {
  const input = route.assets[0].address;
  const output = route.assets[route.assets.length - 1].address;
  const max = pad(toHex(maxUint256));
  // Solady ERC20 slots: balance keccak256(owner ++ bytes8(0) ++ 0x87a211a2),
  // allowance keccak256(owner ++ bytes8(0) ++ 0x7f5e9f20 ++ spender).
  const balanceSlot = keccak256(concat([SIM_SENDER, "0x0000000000000000", "0x87a211a2"]));
  const allowanceSlot = keccak256(
    concat([SIM_SENDER, "0x0000000000000000", "0x7f5e9f20", CONTRACTS.permit2]),
  );
  // Permit2 allowance[owner][token][spender] lives in mapping slot 1.
  const slotOf = (key: Address, slot: Hex) =>
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [key, slot]));
  const permitSlot = slotOf(
    CONTRACTS.universalRouter,
    slotOf(input, slotOf(SIM_SENDER, pad(toHex(1)))),
  );
  const permitValue = pad(
    toHex((BigInt(Math.floor(Date.now() / 1000) + 3600) << 160n) | (2n ** 160n - 1n)),
  );
  const swap = encodeSwap(route, amountIn, 0n, BigInt(Math.floor(Date.now() / 1000) + 600), SIM_RECIPIENT);
  const read = isEth(output)
    ? { to: MULTICALL3, data: encodeFunctionData({ abi: multicallAbi, functionName: "getEthBalance", args: [SIM_RECIPIENT] }) }
    : { to: output, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [SIM_RECIPIENT] }) };
  const [block] = await publicClient.simulateBlocks({
    blocks: [
      {
        stateOverrides: [
          {
            address: input,
            stateDiff: [
              { slot: balanceSlot, value: pad(toHex(amountIn)) },
              { slot: allowanceSlot, value: max },
            ],
          },
          { address: CONTRACTS.permit2, stateDiff: [{ slot: permitSlot, value: permitValue }] },
          { address: SIM_SENDER, balance: 10n ** 18n },
          { address: SIM_RECIPIENT, balance: 0n },
        ],
        calls: [
          {
            account: SIM_SENDER,
            to: CONTRACTS.universalRouter,
            data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: swap.args }),
          },
          read,
        ],
      },
    ],
  });
  const [swapCall, balance] = block.calls;
  if (swapCall.status !== "success") throw new SwapSimulationError(swapCall.data);
  return BigInt(balance.data);
}

export class SwapSimulationError extends Error {
  constructor(public data: Hex) {
    super("The pool cannot fill this sale. Try a smaller amount.");
  }
}

/** Quote any route: the V4Quoter for buys, a router simulation for ERC20T sells. */
export const quote = (route: Route, amountIn: bigint, sell: boolean) =>
  sell ? simulateSell(route, amountIn) : quoteRoute(route, amountIn);

export const minimumOut = (amountOut: bigint, slippageBps: number) =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

/** Universal Router execute() arguments for an exact-input v4 swap. */
export function encodeSwap(
  route: Route,
  amountIn: bigint,
  amountOutMinimum: bigint,
  deadline: bigint,
  // Simulation only: send output to a fixed address instead of the caller.
  recipient?: Address,
) {
  const path = pathKeys(route);
  const swap = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "currencyIn", type: "address" },
          {
            name: "path",
            type: "tuple[]",
            components: [
              { name: "intermediateCurrency", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
              { name: "hookData", type: "bytes" },
            ],
          },
          // Router 2.1.2 layout: per-hop price floors; zero leaves amountOutMinimum in charge.
          { name: "minHopPriceX36", type: "uint256[]" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
        ],
      },
    ],
    [
      {
        currencyIn: route.assets[0].address,
        path,
        minHopPriceX36: path.map(() => 0n),
        amountIn,
        amountOutMinimum,
      },
    ],
  );
  const pair = [{ type: "address" }, { type: "uint256" }] as const;
  const settle = encodeAbiParameters(pair, [route.assets[0].address, amountIn]);
  const out = route.assets[route.assets.length - 1].address;
  // TAKE with amount 0 takes the full open delta (ActionConstants.OPEN_DELTA).
  const take = recipient
    ? encodeAbiParameters(
        [{ type: "address" }, { type: "address" }, { type: "uint256" }],
        [out, recipient, 0n],
      )
    : encodeAbiParameters(pair, [out, amountOutMinimum]);
  const actions = `0x${[SWAP_EXACT_IN, SETTLE_ALL, recipient ? TAKE : TAKE_ALL]
    .map((a) => a.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
  const input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    [actions, [swap, settle, take]],
  );
  return {
    args: [V4_SWAP as Hex, [input], deadline] as const,
    value: isEth(route.assets[0].address) ? amountIn : 0n,
  };
}
