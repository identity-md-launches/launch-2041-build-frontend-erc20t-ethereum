import { formatUnits, isAddress, parseUnits, type Address } from "viem";
import { BASES, CONTRACTS, NATIVE_ETH, type BaseToken } from "./contracts";
import { NETWORK, supportedHooks } from "./networks";
export type LaunchDraft = {
  name: string;
  symbol: string;
  supply: string;
  mode: "now" | "later";
  base: BaseToken;
  price: string;
  allocation: number;
  tax: number;
  decay: boolean;
  interval: string;
  feeRecipient: string;
  decayRecipient: string;
};
export const defaultDraft: LaunchDraft = {
  name: "",
  symbol: "",
  supply: "1000000000",
  mode: "now",
  base: BASES[0],
  price: "0.00000001",
  allocation: 10,
  tax: 3,
  decay: false,
  interval: "60",
  feeRecipient: "",
  decayRecipient: "",
};
export const percentBps = (value: number) => Math.round(value * 100);
export const displayNumber = (n: number, digits = 4) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(n);
export const displayAmount = (n: bigint, decimals = 18) => {
  const raw = formatUnits(n, decimals);
  return Number(raw) >= 0.000001 ? displayNumber(Number(raw), 8) : raw;
};
export function parseDecimal(value: string, decimals: number): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))
    throw new Error("Enter a positive decimal number without commas.");
  if ((value.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  return amount;
}
export const allocationAmounts = (supply: bigint, bps: number) => {
  if (!Number.isInteger(bps) || bps < 0 || bps > 2000)
    throw new Error("Keep between 0% and 20% of supply.");
  const creator = (supply * BigInt(bps)) / 10000n;
  return { creator, liquidity: supply - creator };
};
export const decayDuration = (restingBps: number, interval: number) =>
  Math.ceil((9900 - restingBps) / 100) * interval;
export function duration(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${displayNumber(seconds / 60, 1)} minutes`;
  if (seconds < 86400) return `${displayNumber(seconds / 3600, 1)} hours`;
  return `${displayNumber(seconds / 86400, 1)} days`;
}
export function validRecipient(value: string) {
  return (
    isAddress(value) &&
    value.toLowerCase() !== NATIVE_ETH &&
    !Object.values(CONTRACTS).some((v) => v === value.toLowerCase()) &&
    !supportedHooks.includes(value.toLowerCase())
  );
}
export function draftErrors(
  draft: LaunchDraft,
  step: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!draft.name.trim()) errors.name = "Give your token a name.";
    if (!draft.symbol.trim()) errors.symbol = "Add a token symbol.";
    try {
      const supply = parseDecimal(draft.supply, 18);
      if (
        allocationAmounts(supply, percentBps(draft.allocation)).liquidity >
        2n ** 128n - 1n
      )
        errors.supply =
          "The liquidity allocation must fit within the contract’s uint128 limit.";
    } catch (e) {
      errors.supply = (e as Error).message;
    }
  }
  if (step === 1) {
    if (draft.mode === "now") {
      try {
        parseDecimal(draft.price, draft.base.decimals);
      } catch (e) {
        errors.price = (e as Error).message;
      }
    }
    if (
      draft.tax < 0.3 ||
      draft.tax > 5 ||
      !Number.isInteger(percentBps(draft.tax))
    )
      errors.tax = "Choose a tax between 0.3% and 5%.";
    if (draft.allocation < 0 || draft.allocation > 20)
      errors.allocation = "Keep between 0% and 20%.";
    if (
      draft.decay &&
      (!/^\d+$/.test(draft.interval) ||
        +draft.interval < 1 ||
        +draft.interval > 4294967295)
    )
      errors.interval =
        "Use a whole number of seconds from 1 to 4,294,967,295.";
    if (draft.feeRecipient && !validRecipient(draft.feeRecipient))
      errors.feeRecipient = "Enter a valid recipient wallet address.";
    if (draft.decayRecipient && !validRecipient(draft.decayRecipient))
      errors.decayRecipient = "Enter a valid decay recipient wallet address.";
  }
  return errors;
}
export function buildConfig(draft: LaunchDraft, account: Address) {
  const errors = { ...draftErrors(draft, 0), ...draftErrors(draft, 1) };
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const supply = parseDecimal(draft.supply, 18);
  return {
    name: draft.name.trim(),
    symbol: draft.symbol.trim(),
    supply,
    lpSupply: allocationAmounts(supply, percentBps(draft.allocation)).liquidity,
    owner: account,
    hook: CONTRACTS.hook,
    quoteToken: draft.base.address,
    positionManager: CONTRACTS.positionManager,
    permit2: CONTRACTS.permit2,
    taxBps: percentBps(draft.tax),
    feeRecipient: (draft.feeRecipient || account) as Address,
    launchTaxBps: draft.decay ? 9900 : 0,
    taxDecayIntervalSeconds: draft.decay ? +draft.interval : 0,
    feeDecayRecipient: (draft.decayRecipient ||
      draft.feeRecipient ||
      account) as Address,
  };
}
export function errorMessage(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string; name?: string };
  const message = e?.shortMessage || e?.message || "The request failed.";
  if (/rejected|denied/i.test(message))
    return "The wallet request was declined. Your settings are still here; try again when ready.";
  if (/fetch|network|HTTP|timeout|timed out/i.test(message))
    return `${NETWORK.label} or the requested service could not be reached. Check your connection and try again.`;
  return message.length > 350 ? `${message.slice(0, 347)}…` : message;
}

export function receiptOutcome(
  status: "success" | "reverted",
  replacement?: "cancelled" | "replaced",
) {
  if (replacement) {
    return {
      phase: "error" as const,
      canRetry: true,
      error:
        replacement === "cancelled"
          ? "The transaction was cancelled in your wallet. The original action was not completed."
          : "A different transaction replaced this action. Check the explorer before starting another attempt.",
    };
  }
  if (status === "reverted") {
    return {
      phase: "error" as const,
      canRetry: true,
      error:
        "The transaction reverted. No contract changes were applied; gas was still spent.",
    };
  }
  return { phase: "success" as const, canRetry: false };
}
