import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { mainnet } from "viem/chains";
import { createPublicClient, fallback } from "viem";
export const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.drpc.org",
] as const;
const transport = () =>
  fallback(
    RPC_URLS.map((url) => http(url, { timeout: 12_000, retryCount: 1 })),
    { retryCount: 0 },
  );
export const config = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "ERC20T",
      appLogoUrl: new URL("favicon.svg", document.baseURI).href,
    }),
  ],
  transports: { [mainnet.id]: transport() },
});
export const publicClient = createPublicClient({
  chain: mainnet,
  transport: transport(),
  batch: { multicall: true },
});
