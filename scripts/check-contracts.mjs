/** Read-only production-contract checks. Never requests signatures or broadcasts. */
import {
  createPublicClient,
  http,
  parseAbi,
  parseUnits,
  formatUnits,
} from "viem";
import { tsImport } from "tsx/esm/api";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const { NETWORKS } = await tsImport("../src/networks.ts", import.meta.url);
const { marketCapPrice } = await tsImport("../src/pricing.ts", import.meta.url);
const factoryAbi = JSON.parse(await readFile("src/contracts/factory.json"));
const hookAbi = [
  ...JSON.parse(await readFile("src/contracts/hook.json")),
  ...parseAbi(["function globalDistributorRegistry() view returns (address)"]),
];
const tokenAbi = JSON.parse(await readFile("src/contracts/token.json"));
const report = { checkedAt: new Date().toISOString(), networks: [] };
for (const [key, network] of Object.entries(NETWORKS)) {
  const c = network.contracts;
  const client = createPublicClient({
    chain: network.chain,
    transport: http(
      process.env[`ERC20T_RPC_${network.chain.id}`] || network.rpcUrls[0],
      { timeout: 30_000, retryCount: 0 },
    ),
  });
  const result = {
    network: key,
    source: network.rpcUrls[0],
    chainId: await client.getChainId(),
    block: String(await client.getBlockNumber()),
    checks: [],
  };
  report.networks.push(result);
  const check = async (name, fn) => {
    try {
      const value = await fn();
      result.checks.push({ name, passed: true, value });
      console.log("PASS", key, name);
    } catch (e) {
      result.checks.push({
        name,
        passed: false,
        error: e.shortMessage || e.message,
      });
      console.log("FAIL", key, name, e.shortMessage || e.message);
    }
  };
  if (result.chainId !== network.chain.id)
    throw new Error("RPC returned the wrong chain");
  for (const [address, abi, functionName, expected] of [
    [c.factory, factoryAbi, "implementation", c.implementation],
    [c.hook, hookAbi, "poolManager", c.poolManager],
    [c.hook, hookAbi, "globalDistributorRegistry", c.globalDistributorRegistry],
    [c.positionManager, tokenAbi, "poolManager", c.poolManager],
    [c.positionManager, tokenAbi, "permit2", c.permit2],
  ])
    await check(functionName + " @ " + address, async () => {
      const value = await client.readContract({ address, abi, functionName });
      if (value.toLowerCase() !== expected)
        throw new Error("Deployment does not match configuration");
      return value;
    });
  for (const [name, address] of Object.entries(c))
    await check("contract code: " + name, async () => {
      const code = await client.getCode({ address });
      if (!code || code === "0x") throw new Error("No deployed code");
      return (code.length - 2) / 2;
    });
  // The hook's public onchain owner is only an eth_call sender, never a signer.
  const account = await client.readContract({
    address: c.hook,
    abi: hookAbi,
    functionName: "owner",
  });
  for (const base of network.bases) {
    if (base.symbol !== "ETH")
      await check(base.symbol + " eligibility / metadata", async () => {
        const status = await client.readContract({
          address: c.hook,
          abi: hookAbi,
          functionName: "externalBases",
          args: [base.address],
        });
        if (!status[0] || !status[1])
          throw new Error("External base disabled/unregistered");
        const abi = parseAbi([
          "function symbol() view returns(string)",
          "function decimals() view returns(uint8)",
        ]);
        const symbol = await client.readContract({
          address: base.address,
          abi,
          functionName: "symbol",
        });
        const decimals = await client.readContract({
          address: base.address,
          abi,
          functionName: "decimals",
        });
        if (symbol !== base.symbol || decimals !== base.decimals)
          throw new Error("Base metadata mismatch");
        return { status, symbol, decimals };
      });
    const supply = parseUnits("1000000000", 18);
    // A deterministic USD input exercises factory alignment. This is not presented as a live price.
    const price = marketCapPrice(
      150_000,
      supply,
      base.symbol === "ETH" ? "2500" : base.symbol === "IMD" ? "5" : "0.008",
      base.decimals,
    );
    for (const currency0 of [false, true])
      await check(
        `${base.symbol} preview, tokenIsCurrency0=${currency0}`,
        async () => {
          const p = await client.readContract({
            address: c.factory,
            abi: factoryAbi,
            functionName: "previewQuotedLaunch",
            args: [supply, 1000, price, currency0],
          });
          if (p.effectivePriceWei < price || p.sqrtPriceX96 <= 0n)
            throw new Error("Invalid aligned price");
          return { requested: formatUnits(price, base.decimals), preview: p };
        },
      );
    const config = {
      name: "Read-only launch simulation",
      symbol: "SIM",
      supply,
      lpSupply: (supply * 9n) / 10n,
      owner: account,
      hook: c.hook,
      quoteToken: base.address,
      positionManager: c.positionManager,
      permit2: c.permit2,
      taxBps: 300,
      feeRecipient: account,
      launchTaxBps: 9900,
      taxDecayIntervalSeconds: 60,
      feeDecayRecipient: account,
    };
    for (const functionName of ["create", "createAndLaunchAtPrice"])
      await check(`${base.symbol} ${functionName} simulation`, async () => {
        await client.simulateContract({
          address: c.factory,
          abi: factoryAbi,
          functionName,
          args: functionName === "create" ? [config] : [config, 1000, price],
          account,
          ...(functionName === "create" ? {} : { value: 0n }),
        });
        return "eth_call only; no transaction sent";
      });
  }
}
await mkdir("test/scratch", { recursive: true });
await writeFile(
  "test/scratch/live-contract-checks.json",
  JSON.stringify(report, (_, v) => (typeof v === "bigint" ? String(v) : v), 2),
);
const checks = report.networks.flatMap((n) => n.checks);
console.log(
  `${checks.filter((c) => c.passed).length}/${checks.length} live checks passed`,
);
if (checks.some((c) => !c.passed)) process.exitCode = 1;
