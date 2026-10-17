import { createPublicClient, http, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const client = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com", {
    timeout: 30000,
    retryCount: 1,
  }),
});
const factory = "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
  hook = "0xed9a04fa6693e754661a22502524df9b1857e544";
const f = JSON.parse(await readFile("src/contracts/factory.json")),
  t = JSON.parse(await readFile("src/contracts/token.json")),
  h = JSON.parse(await readFile("src/contracts/hook.json"));
const token = "0xA639FA428738787388a8290baC439B8fFBF9599a";
const owner = await client.readContract({
  address: token,
  abi: t,
  functionName: "owner",
});
const block = await client.getBlockNumber();
const results = { block: String(block), owner, reads: [], simulations: [] };
for (const [address, abi, name, args] of [
  [factory, f, "implementation", []],
  [hook, h, "poolManager", []],
  [hook, h, "PROTOCOL_FEE_BPS", []],
  [hook, h, "externalBases", ["0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7"]],
  [hook, h, "externalBases", ["0xa0df17b5ac76ababa36e1450e2cbcd18a620c845"]],
  [token, t, "taxBps", []],
]) {
  try {
    const value = await client.readContract({
      address,
      abi,
      functionName: name,
      args,
    });
    results.reads.push({ name, args, value });
    console.log(name, value);
  } catch (e) {
    results.reads.push({ name, error: e.shortMessage || e.message });
  }
}
for (const quote of [
  "0x0000000000000000000000000000000000000000",
  "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
  "0xa0df17b5ac76ababa36e1450e2cbcd18a620c845",
]) {
  const config = {
    name: "Read-only launch simulation",
    symbol: "SIM",
    supply: parseUnits("1000000000", 18),
    lpSupply: parseUnits("900000000", 18),
    owner,
    hook,
    quoteToken: quote,
    positionManager: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
    permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    taxBps: 300,
    feeRecipient: owner,
    launchTaxBps: 9900,
    taxDecayIntervalSeconds: 60,
    feeDecayRecipient: owner,
  };
  for (const fn of ["create", "createAndLaunchAtPrice"]) {
    try {
      await client.simulateContract({
        address: factory,
        abi: f,
        functionName: fn,
        args: fn === "create" ? [config] : [config, 1000, 10000000000n],
        account: owner,
        ...(fn === "create" ? {} : { value: 0n }),
      });
      results.simulations.push({ fn, quote, ok: true });
      console.log("PASS", fn, quote);
    } catch (e) {
      results.simulations.push({
        fn,
        quote,
        ok: false,
        error: e.shortMessage || e.message,
      });
      console.log("FAIL", fn, e.shortMessage || e.message);
    }
  }
}
for (const [fn, args] of [
  ["setFeeRecipient", [owner]],
  ["setFeeDecayRecipient", [owner]],
  ["setTaxBps", [300]],
  ["setExternalLiquidityEnabled", [true]],
  ["setPairingEnabled", [false]],
  ["setUseGlobalDistributors", [false]],
  ["setDistributors", [["0xa0df17b5ac76ababa36e1450e2cbcd18a620c845"], true]],
]) {
  try {
    await client.simulateContract({
      address: token,
      abi: t,
      functionName: fn,
      args,
      account: owner,
    });
    results.simulations.push({ fn, ok: true });
    console.log("PASS", fn);
  } catch (e) {
    results.simulations.push({
      fn,
      ok: false,
      error: e.shortMessage || e.message,
    });
    console.log("FAIL", fn, e.shortMessage || e.message);
  }
}
const previews = [];
for (const currency0 of [false, true]) {
  const preview = await client.readContract({
    address: factory,
    abi: f,
    functionName: "previewQuotedLaunch",
    args: [parseUnits("1000000000", 18), 1000, 10000000000n, currency0],
  });
  previews.push({ currency0, preview });
}
results.previews = previews;
await mkdir("test/scratch", { recursive: true });
await writeFile(
  "test/scratch/live-contract-checks.json",
  JSON.stringify(
    results,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ),
);
if (
  results.simulations.some((s) => !s.ok) ||
  results.reads.some((r) => r.error)
)
  process.exitCode = 1;
