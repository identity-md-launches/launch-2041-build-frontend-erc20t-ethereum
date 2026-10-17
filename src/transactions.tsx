import { useRef, useState } from "react";
import { useConnection, useWalletClient } from "wagmi";
import { mainnet } from "viem/chains";
import {
  type Abi,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { publicClient } from "./config";
import { errorMessage, receiptOutcome } from "./model";
import { Busy, Notice } from "./ui";
export type TxRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};
export type TxState = {
  phase: "idle" | "simulating" | "signing" | "pending" | "success" | "error";
  error?: string;
  hash?: Hash;
  receipt?: TransactionReceipt;
  replacement?: "cancelled" | "replaced";
  canRetry?: boolean;
};
export function useTransaction() {
  const connection = useConnection();
  const { data: wallet } = useWalletClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });
  const active = useRef(false);
  async function run(request: TxRequest, preflight?: () => Promise<void>) {
    if (active.current) return;
    active.current = true;
    let hash: Hash | undefined;
    let replacement: "cancelled" | "replaced" | undefined;
    try {
      if (!connection.address || !wallet)
        throw new Error("Connect a wallet before submitting.");
      if (connection.chainId !== 1 || (await wallet.getChainId()) !== 1)
        throw new Error("Switch your wallet to Ethereum mainnet first.");
      setState({ phase: "simulating" });
      await preflight?.();
      const { request: simulation } = await publicClient.simulateContract({
        ...request,
        account: connection.address,
      });
      // Recheck the live wallet after async simulation; account/network changes invalidate the review.
      const [accounts, chainId] = await Promise.all([
        wallet.getAddresses(),
        wallet.getChainId(),
      ]);
      if (
        chainId !== 1 ||
        accounts[0]?.toLowerCase() !== connection.address.toLowerCase()
      )
        throw new Error(
          "Your wallet changed. Review the current account and try again.",
        );
      setState({ phase: "signing" });
      hash = await wallet.writeContract({ ...simulation, chain: mainnet });
      setState({ phase: "pending", hash });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 180000,
        onReplaced: (event) => {
          hash = event.transactionReceipt.transactionHash;
          if (event.reason !== "repriced") replacement = event.reason;
          setState({ phase: "pending", hash, replacement });
        },
      });
      const outcome = receiptOutcome(receipt.status, replacement);
      setState({ ...outcome, hash, receipt, replacement });
      return outcome.phase === "success" ? receipt : undefined;
    } catch (e) {
      setState({ phase: "error", error: errorMessage(e), hash, replacement });
      return undefined;
    } finally {
      active.current = false;
    }
  }
  async function checkReceipt() {
    if (!state.hash || active.current) return;
    active.current = true;
    const hash = state.hash;
    const replacement = state.replacement;
    setState({ phase: "pending", hash, replacement });
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      setState({
        ...receiptOutcome(receipt.status, replacement),
        hash,
        receipt,
        replacement,
      });
    } catch (e) {
      setState({ phase: "error", hash, replacement, error: errorMessage(e) });
    } finally {
      active.current = false;
    }
  }
  return {
    state,
    run,
    checkReceipt,
    reset: () => {
      if (!active.current) setState({ phase: "idle" });
    },
    busy: ["simulating", "signing", "pending"].includes(state.phase),
  };
}
export function TransactionStatus({
  state,
  checkReceipt,
  reset,
}: {
  state: TxState;
  checkReceipt?: () => void;
  reset?: () => void;
}) {
  if (state.phase === "idle") return null;
  const labels = {
    simulating: "Checking the transaction on Ethereum…",
    signing: "Confirm the transaction in your wallet.",
    pending: "Waiting for Ethereum confirmation…",
    success: "Transaction confirmed.",
    error: state.error,
  };
  return (
    <div className="transaction-status" aria-live="polite">
      {state.phase === "error" ? (
        <Notice error>{labels.error}</Notice>
      ) : state.phase === "success" ? (
        <p className="success-line">
          <CheckCircle2 size={20} />
          {labels.success}
        </p>
      ) : (
        <Busy text={labels[state.phase]} />
      )}
      {state.hash && (
        <div className="transaction-links">
          <a
            className="text-link"
            href={`https://etherscan.io/tx/${state.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
            <ArrowUpRight size={16} />
          </a>
          {state.phase === "error" && !state.canRetry && checkReceipt && (
            <button
              type="button"
              className="button secondary"
              onClick={checkReceipt}
            >
              Check confirmation
            </button>
          )}
          {state.canRetry && reset && (
            <button type="button" className="button secondary" onClick={reset}>
              Clear failed attempt
            </button>
          )}
        </div>
      )}
      {state.phase === "error" && state.hash && !state.canRetry && (
        <p className="field-hint">
          A transaction was submitted. Check its status before sending another.
        </p>
      )}
    </div>
  );
}
