import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, decodeFunctionData, parseUnits } from "viem";
import {
  allocationAmounts,
  buildConfig,
  decayDuration,
  defaultDraft,
  draftErrors,
  parseDecimal,
  validRecipient,
} from "../src/model.ts";
import {
  BASES,
  CONTRACTS,
  factoryAbi,
  NATIVE_ETH,
  tokenAbi,
} from "../src/contracts/index.ts";
// Public owner of a real factory deployment. Used only as input for pure encoding tests.
const publicOwner = "0x91e758bEa19c65A7FBFd10d78810D38456945908";
const draft = { ...defaultDraft, name: "Encoding test", symbol: "ENCODE" };
test("decimal parsing stays exact above JavaScript safe integer range", () => {
  assert.equal(
    parseDecimal("123456789012345678.123456789012345678", 18),
    123456789012345678123456789012345678n,
  );
});
test("rejects exponent notation, zero, negative and excessive fractional precision", () => {
  for (const value of ["1e9", "-1", "0", "1,000", ".5", "1.0000001"])
    assert.throws(() => parseDecimal(value, 6));
  assert.equal(parseDecimal("0.000001", 6), 1n);
});
test("allocations floor creator supply and preserve every base unit", () => {
  assert.deepEqual(allocationAmounts(101n, 2000), {
    creator: 20n,
    liquidity: 81n,
  });
  assert.deepEqual(allocationAmounts(101n, 0), {
    creator: 0n,
    liquidity: 101n,
  });
  assert.throws(() => allocationAmounts(100n, 2001));
  assert.throws(() => allocationAmounts(100n, -1));
});
test("decay clamps fractional resting rates after the correct number of intervals", () => {
  assert.equal(decayDuration(300, 60), 5760);
  assert.equal(decayDuration(30, 1), 99);
  assert.equal(decayDuration(500, 60), 5640);
});
test("invalid fields block review, zero interval and over-cap supply are rejected", () => {
  assert.ok(draftErrors(defaultDraft, 0).name);
  assert.ok(draftErrors(defaultDraft, 0).symbol);
  assert.ok(draftErrors({ ...draft, decay: true, interval: "0" }, 1).interval);
  assert.ok(
    draftErrors({ ...draft, supply: "999999999999999999999999999" }, 0).supply,
  );
});
test("recipient validation rejects native sentinel and infrastructure addresses", () => {
  assert.equal(validRecipient(publicOwner), true);
  assert.equal(validRecipient(NATIVE_ETH), false);
  for (const address of Object.values(CONTRACTS))
    assert.equal(validRecipient(address), false);
});
test("native ETH sentinel is a real quote convention, never a fee recipient", () => {
  const config = buildConfig(draft, publicOwner);
  assert.equal(config.quoteToken, NATIVE_ETH);
  assert.equal(config.owner, publicOwner);
  assert.equal(config.feeRecipient, publicOwner);
  assert.equal(config.feeDecayRecipient, publicOwner);
  assert.equal(config.launchTaxBps, 0);
  assert.equal(config.taxDecayIntervalSeconds, 0);
});
test("decay config and ERC-20 base use explicit values and quoted decimals", () => {
  const config = buildConfig(
    { ...draft, base: BASES[2], decay: true, interval: "15" },
    publicOwner,
  );
  assert.equal(config.quoteToken, BASES[2].address);
  assert.equal(config.launchTaxBps, 9900);
  assert.equal(config.taxDecayIntervalSeconds, 15);
  assert.equal(config.taxBps, 300);
  assert.equal(config.lpSupply, parseUnits("900000000", 18));
});
test("deploy-only and atomic launch encode against the retrieved factory ABI", () => {
  const config = buildConfig(draft, publicOwner);
  const deploy = encodeFunctionData({
    abi: factoryAbi,
    functionName: "create",
    args: [config],
  });
  assert.equal(
    decodeFunctionData({ abi: factoryAbi, data: deploy }).functionName,
    "create",
  );
  const data = encodeFunctionData({
    abi: factoryAbi,
    functionName: "createAndLaunchAtPrice",
    args: [config, 1000, parseUnits("0.00000001", 18)],
  });
  const decoded = decodeFunctionData({ abi: factoryAbi, data });
  assert.equal(decoded.functionName, "createAndLaunchAtPrice");
  assert.equal(decoded.args?.[1], 1000);
  assert.equal(decoded.args?.[2], 10000000000n);
});
test("all owner controls encode with verified function names and argument shapes", () => {
  const controls: [string, unknown[]][] = [
    ["setFeeRecipient", [publicOwner]],
    ["setFeeDecayRecipient", [publicOwner]],
    ["setDistributors", [[publicOwner], false]],
    ["setTaxBps", [300]],
    ["setExternalLiquidityEnabled", [true]],
    ["setPairingEnabled", [true]],
    ["setUseGlobalDistributors", [false]],
    ["launch", [1n, 0, 60]],
  ];
  for (const [functionName, args] of controls) {
    const data = encodeFunctionData({ abi: tokenAbi, functionName, args });
    assert.equal(
      decodeFunctionData({ abi: tokenAbi, data }).functionName,
      functionName,
    );
  }
});

test("mined reverts and wallet cancellation never report the original action as successful", async () => {
  const { receiptOutcome } = await import("../src/model.ts");
  assert.equal(receiptOutcome("success").phase, "success");
  assert.equal(receiptOutcome("success").canRetry, false);
  assert.equal(receiptOutcome("reverted").phase, "error");
  assert.equal(receiptOutcome("reverted").canRetry, true);
  assert.equal(receiptOutcome("success", "cancelled").phase, "error");
  assert.match(receiptOutcome("success", "cancelled").error!, /cancelled/);
  assert.equal(receiptOutcome("success", "replaced").phase, "error");
});
