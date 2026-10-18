import test from "node:test";
import assert from "node:assert/strict";
import { parseUnits, isAddress } from "viem";
import {
  marketCapPrice,
  impliedMarketCap,
  selectPricePair,
  assertFreshQuote,
  type UsdQuote,
} from "../src/pricing.ts";
import { NETWORKS } from "../src/networks.ts";
const supply = parseUnits("1000000000", 18);
test("market cap converts to base atomic units for ETH, IMD, FWA and six-decimal bases", () => {
  assert.equal(marketCapPrice(50_000, supply, "2500", 18), 20_000_000_000n);
  assert.equal(marketCapPrice(150_000, supply, "5", 18), 30_000_000_000_000n);
  assert.equal(
    marketCapPrice(500_000, supply, "0.008", 18),
    62_500_000_000_000_000n,
  );
  assert.equal(marketCapPrice(1_000_000, supply, "1", 6), 1000n);
});
test("fractional/very large supplies use exact integer division and round upward", () => {
  assert.equal(
    marketCapPrice(50_000, parseUnits("3", 18), "1", 6),
    16_666_666_667n,
  );
  assert.equal(
    marketCapPrice(50_000, parseUnits("0.5", 18), "2500", 18),
    parseUnits("40", 18),
  );
  assert.equal(
    marketCapPrice(1_000_000, parseUnits("10000000000000000", 18), "1", 18),
    100_000_000n,
  );
});
test("valuation uses total supply; doubling supply halves starting price", () => {
  const price = marketCapPrice(150_000, supply, "2500", 18);
  assert.equal(price, marketCapPrice(150_000, supply * 2n, "2500", 18) * 2n);
  assert.equal(impliedMarketCap(price, supply, "2500", 18), "150000");
});
test("unrepresentable, zero, negative, non-decimal and overflowing prices are refused", () => {
  for (const usd of [
    "0",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "",
    "1.0000000000000000001",
  ])
    assert.throws(() => marketCapPrice(50_000, supply, usd, 18));
  assert.throws(() => marketCapPrice(50_000, supply, "50000", 0));
  assert.throws(() => marketCapPrice(0, supply, "1", 18));
  assert.throws(() => marketCapPrice(50_000, 0n, "1", 18));
  assert.throws(() => marketCapPrice(50_000, supply, "1", 255));
  assert.throws(() =>
    marketCapPrice(1_000_000, 1n, "0.000000000000000001", 36),
  );
});
test("pricing matches chain and contract, then selects the deepest quoted base pair", () => {
  const address = NETWORKS.ethereum.bases[1].address;
  const pair = (
    chainId: string,
    addr: string,
    usd: string,
    liquidity = 100,
  ) => ({
    chainId,
    baseToken: { address: addr },
    priceUsd: usd,
    liquidity: { usd: liquidity },
  });
  const selected = selectPricePair(
    [
      pair("robinhood", address, "1000", 1e9),
      pair("ethereum", NETWORKS.ethereum.bases[2].address, "999", 1e9),
      pair("ethereum", address, "5", 5000),
      pair("ethereum", address, "4", 100),
      pair("ethereum", address, "0", 1e9),
    ],
    address,
    "ethereum",
  );
  assert.equal(selected.priceUsd, "5");
  assert.throws(() => selectPricePair([], address, "ethereum"));
  assert.throws(() =>
    selectPricePair([pair("ethereum", address, "5", 0)], address, "ethereum"),
  );
});
test("expired and future-dated price quotes cannot be signed", () => {
  const now = 1_000_000;
  const q: UsdQuote = {
    usd: "2500",
    source: "CoinGecko",
    fetchedAt: now,
    updatedAt: now,
    url: "https://www.coingecko.com/en/coins/ethereum",
  };
  assert.doesNotThrow(() => assertFreshQuote(q, now));
  assert.throws(() => assertFreshQuote(q, now + 300_001));
  assert.throws(() =>
    assertFreshQuote({ ...q, updatedAt: now - 300_001 }, now),
  );
  assert.throws(() => assertFreshQuote({ ...q, updatedAt: now + 60_001 }, now));
});
test("both network configurations contain valid distinct contracts and network-specific IMD", () => {
  for (const network of Object.values(NETWORKS)) {
    for (const address of Object.values(network.contracts))
      assert(isAddress(address), address);
    for (const base of network.bases) assert(isAddress(base.address));
  }
  assert.equal(NETWORKS.ethereum.chain.id, 1);
  assert.equal(NETWORKS.robinhood.chain.id, 4663);
  assert.notEqual(
    NETWORKS.ethereum.bases[1].address,
    NETWORKS.robinhood.bases[1].address,
  );
});
