import { formatUnits, parseUnits } from "viem";
import { NATIVE_ETH, type BaseToken, type NetworkKey } from "./networks";

export const MARKET_CAPS = [50_000, 150_000, 500_000, 1_000_000] as const;
export type PriceSettings = {
  mode: "marketcap" | "manual";
  marketCap: number;
  manualPrice: string;
};
export const initialPriceSettings: PriceSettings = {
  mode: "marketcap",
  marketCap: 150_000,
  manualPrice: "",
};
export type UsdQuote = {
  usd: string;
  fetchedAt: number;
  updatedAt: number;
  source: "CoinGecko" | "DexScreener";
  url: string;
};
export const QUOTE_MAX_AGE = 5 * 60_000;
export function assertFreshQuote(quote: UsdQuote, now = Date.now()) {
  if (
    now - quote.fetchedAt > QUOTE_MAX_AGE ||
    now - quote.updatedAt > QUOTE_MAX_AGE ||
    quote.updatedAt > now + 60_000 ||
    quote.fetchedAt > now + 60_000
  )
    throw new Error(
      "The price quote has expired. Go back and refresh prices before reviewing again.",
    );
}
function usdUnits(value: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value))
    throw new Error("The price service returned an invalid USD price.");
  const units = parseUnits(value, 18);
  if (units <= 0n) throw new Error("A positive USD price is required.");
  return units;
}
/** Fully diluted valuation: total supply, including the creator allocation.
 * All division is integer arithmetic. Round upward to one base-token atomic unit.
 * This result is passed to previewQuotedLaunch/createAndLaunchAtPrice unchanged.
 */
export function marketCapPrice(
  targetUsd: number,
  supply: bigint,
  baseUsd: string,
  baseDecimals: number,
): bigint {
  if (
    !Number.isSafeInteger(targetUsd) ||
    targetUsd <= 0 ||
    supply <= 0n ||
    !Number.isInteger(baseDecimals) ||
    baseDecimals < 0 ||
    baseDecimals > 36
  )
    throw new Error("Enter a valid supply, market cap, and base currency.");
  const numerator =
    BigInt(targetUsd) * 10n ** 18n * 10n ** BigInt(18 + baseDecimals);
  const denominator = supply * usdUnits(baseUsd);
  if (numerator < denominator)
    throw new Error(
      "This price is below the base token’s precision. Use a smaller supply or a higher market cap.",
    );
  const result = (numerator + denominator - 1n) / denominator;
  if (result >= 2n ** 256n)
    throw new Error("The starting price exceeds the contract’s price limit.");
  return result;
}
export function impliedMarketCap(
  price: bigint,
  supply: bigint,
  baseUsd: string,
  baseDecimals: number,
): string {
  const usd =
    (price * supply * usdUnits(baseUsd)) / 10n ** BigInt(18 + baseDecimals);
  return formatUnits(usd, 18);
}
export type DexPair = {
  chainId: string;
  baseToken: { address: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  url?: string;
};
export function selectPricePair(
  pairs: DexPair[],
  address: string,
  chain: string,
): DexPair {
  const candidates = pairs.filter(
    (p) =>
      p.chainId === chain &&
      p.baseToken?.address?.toLowerCase() === address.toLowerCase() &&
      p.priceUsd &&
      /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(p.priceUsd) &&
      Number(p.priceUsd) > 0 &&
      Number.isFinite(p.liquidity?.usd) &&
      (p.liquidity?.usd ?? 0) > 0,
  );
  candidates.sort((a, b) => b.liquidity!.usd! - a.liquidity!.usd!);
  if (!candidates[0])
    throw new Error(
      "No liquid USD quote is available for this base on this network. Retry or enter a manual starting price.",
    );
  return candidates[0];
}
export async function fetchUsdQuote(
  base: BaseToken,
  network: NetworkKey,
  signal?: AbortSignal,
): Promise<UsdQuote> {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  if (base.address === NATIVE_ETH) {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_last_updated_at=true&precision=full",
      { signal: requestSignal, cache: "no-store" },
    );
    if (!response.ok)
      throw new Error(
        "ETH pricing is unavailable. Refresh prices or enter a manual starting price.",
      );
    const data = await response.json();
    const usd = data.ethereum?.usd;
    const updatedAt = data.ethereum?.last_updated_at * 1000;
    if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(updatedAt))
      throw new Error(
        "ETH pricing returned an invalid quote. Refresh prices or use a manual price.",
      );
    const quote: UsdQuote = {
      usd: String(usd),
      fetchedAt: Date.now(),
      updatedAt,
      source: "CoinGecko",
      url: "https://www.coingecko.com/en/coins/ethereum",
    };
    usdUnits(quote.usd);
    assertFreshQuote(quote);
    return quote;
  }
  const response = await fetch(
    `https://api.dexscreener.com/token-pairs/v1/${network}/${base.address}`,
    { signal: requestSignal, cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      "Base-token pricing is unavailable. Refresh prices or enter a manual starting price.",
    );
  const data = await response.json();
  if (!Array.isArray(data))
    throw new Error(
      "The price service returned an invalid response. Retry or use a manual price.",
    );
  const pair = selectPricePair(data, base.address, network);
  const now = Date.now();
  return {
    usd: pair.priceUsd!,
    fetchedAt: now,
    updatedAt: now,
    source: "DexScreener",
    url: pair.url?.startsWith(`https://dexscreener.com/${network}/`)
      ? pair.url
      : `https://dexscreener.com/${network}/${base.address}`,
  };
}
