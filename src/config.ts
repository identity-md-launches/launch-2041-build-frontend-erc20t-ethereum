import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import { mainnet } from "viem/chains";
import { activeChain, NETWORK, NETWORKS, robinhood } from "./networks";
import { createPublicClient, fallback } from "viem";
export const RPC_URLS = NETWORK.rpcUrls;
const transport = (urls: readonly string[]) =>
  fallback(
    urls.map((url) => http(url, { timeout: 12_000, retryCount: 1 })),
    { retryCount: 0 },
  );
export const config = createConfig({
  chains: [mainnet, robinhood],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "ERC20T",
      appLogoUrl: new URL("favicon.svg", document.baseURI).href,
    }),
  ],
  transports: {
    [mainnet.id]: transport(NETWORKS.ethereum.rpcUrls),
    [robinhood.id]: transport(NETWORKS.robinhood.rpcUrls),
  },
});
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: transport(RPC_URLS),
  batch: { multicall: false },
});
