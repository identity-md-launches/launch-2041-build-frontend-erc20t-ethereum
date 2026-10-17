import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useConnect,
  useConnectors,
  useConnection,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from "wagmi";
import { ArrowUpRight, Globe, LogOut, Wallet } from "lucide-react";
import { shortAddress } from "./chain";
import { AddressValue, Modal, Notice } from "./ui";
import { errorMessage } from "./model";
const WalletContext = createContext<() => void>(() => {});
export const useOpenWallet = () => useContext(WalletContext);
const OPEN_IN = [
  {
    name: "MetaMask",
    icon: "metaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    name: "Coinbase Wallet",
    icon: "coinbase",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    name: "Rabby",
    icon: "rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    name: "Phantom",
    icon: "phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export function WalletProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const connection = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !("ethereum" in window) &&
    !connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter(
    (c) =>
      !(c.id === "injected" && named) && !(mobile && c.type === "injected"),
  );
  useEffect(() => {
    if (connection.isConnected) setOpen(false);
  }, [connection.isConnected]);
  async function choose(connector: Connector) {
    setNote("");
    try {
      await connect.mutateAsync({ connector });
    } catch (e) {
      setNote(errorMessage(e));
    }
  }
  return (
    <WalletContext.Provider
      value={() => {
        setOpen(true);
        setNote("");
      }}
    >
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={connection.isConnected ? "Your wallet" : "Connect a wallet"}
      >
        {connection.isConnected && connection.address ? (
          <>
            <p className="muted">
              Connected to {connection.chain?.name || "an unsupported network"}.
            </p>
            <AddressValue address={connection.address} />
            <button
              className="button secondary full"
              onClick={() => {
                disconnect.mutate({});
                setOpen(false);
              }}
            >
              <LogOut size={18} />
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted modal-intro">
              Choose a wallet to create and manage tokens on Ethereum.
            </p>
            <div className="wallet-options">
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    href={w.href(location.href)}
                    key={w.name}
                  >
                    <img
                      width="28"
                      height="28"
                      src={`./wallets/${w.icon}.svg`}
                      alt=""
                    />
                    <span>Open in {w.name}</span>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  onClick={() => choose(c)}
                  disabled={connect.isPending}
                >
                  {c.icon ? (
                    <img src={c.icon} alt="" width="28" height="28" />
                  ) : c.id === "coinbaseWalletSDK" ? (
                    <img
                      src="./wallets/coinbase.svg"
                      alt=""
                      width="28"
                      height="28"
                    />
                  ) : (
                    <Globe size={28} />
                  )}
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK"
                        ? mobile
                          ? "Coinbase Smart Wallet"
                          : "Coinbase Wallet"
                        : c.name}
                    {connect.isPending && connect.variables?.connector === c
                      ? " · Opening…"
                      : ""}
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
            {note && <Notice error>{note}</Notice>}
            <p className="field-hint">
              Connecting does not submit a transaction or grant token access.
            </p>
          </>
        )}
      </Modal>
    </WalletContext.Provider>
  );
}
export function ConnectControl() {
  const open = useOpenWallet();
  const { address, isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const [error, setError] = useState("");
  return (
    <div className="connect-wrap">
      <button
        className="button wallet-button"
        onClick={async () => {
          if (isConnected && chainId !== 1) {
            try {
              setError("");
              await switchChain.mutateAsync({ chainId: 1 });
            } catch (e) {
              setError(errorMessage(e));
            }
          } else open();
        }}
        disabled={switchChain.isPending}
      >
        <Wallet size={16} aria-hidden="true" />
        {isConnected && chainId !== 1
          ? switchChain.isPending
            ? "Switching…"
            : "Switch to Ethereum"
          : address
            ? shortAddress(address)
            : "Connect"}
        <span className="wallet-dot" aria-hidden="true" />
      </button>
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
