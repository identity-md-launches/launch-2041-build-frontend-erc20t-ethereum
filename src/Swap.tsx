import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useSwitchChain } from "wagmi";
import { erc20Abi, formatUnits, maxUint160, maxUint256, type Address } from "viem";
import { ArrowDown, ArrowRight, CheckCircle2 } from "lucide-react";
import { publicClient } from "./config";
import { CONTRACTS, NATIVE_ETH } from "./contracts";
import { activeChain, NETWORK } from "./networks";
import { displayAmount, errorMessage, parseDecimal } from "./model";
import {
  buildRoute,
  encodeSwap,
  isEth,
  minimumOut,
  permit2Abi,
  quote as quoteSwap,
  routerAbi,
  type Asset,
  type PoolKey,
} from "./swap";
import { TransactionStatus, useTransaction, type TxRequest } from "./transactions";
import { useOpenWallet } from "./wallet";
import { AddressValue, Modal, Notice } from "./ui";

const ETH: Asset = { address: NATIVE_ETH, symbol: "ETH", decimals: 18 };
const SLIPPAGE = [50, 100, 300, 500];
// Display format for amounts; exact values stay as bigint.
const amountText = (value: bigint, decimals: number) => {
  const n = Number(formatUnits(value, decimals));
  if (n === 0) return "0";
  if (n < 0.000001) return formatUnits(value, decimals);
  return new Intl.NumberFormat("en", {
    maximumSignificantDigits: n >= 1 ? 8 : 6,
  }).format(n);
};

type Review = {
  request: TxRequest;
  amountIn: bigint;
  quoted: bigint;
  minOut: bigint;
  route: Asset[];
};

export function SwapPanel({
  token,
  base,
  pools,
  taxBps,
}: {
  token: Asset;
  base: Asset;
  pools?: { tokenPool: PoolKey; basePool?: PoolKey };
  taxBps: number;
}) {
  const account = useConnection();
  const openWallet = useOpenWallet();
  const switchChain = useSwitchChain();
  const client = useQueryClient();
  const tx = useTransaction();
  const approval = useTransaction();
  const hasBase = !isEth(base.address);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  // ETH is the default counter-asset, routed through the base when needed.
  const [counter, setCounter] = useState<"eth" | "base">("eth");
  const [amount, setAmount] = useState("");
  const [debounced, setDebounced] = useState("");
  const [slippage, setSlippage] = useState(100);
  const [review, setReview] = useState<Review>();
  const [prepError, setPrepError] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(amount.trim()), 350);
    return () => clearTimeout(id);
  }, [amount]);
  const other = counter === "base" && hasBase ? base : ETH;
  const from = side === "buy" ? other : token;
  const to = side === "buy" ? token : other;
  const route = useMemo(
    () => (pools ? buildRoute(from, to, token, base, pools) : undefined),
    [pools, from, to, token, base],
  );
  let amountIn: bigint | undefined;
  let inputError = "";
  if (debounced) {
    try {
      amountIn = parseDecimal(debounced, from.decimals);
      if (amountIn >= 2n ** 128n) throw new Error("This amount is too large.");
    } catch (e) {
      inputError = errorMessage(e);
      amountIn = undefined;
    }
  }
  const balance = useQuery({
    queryKey: ["swap-balance", account.address, from.address],
    enabled: !!account.address,
    refetchInterval: 15000,
    queryFn: () =>
      isEth(from.address)
        ? publicClient.getBalance({ address: account.address! })
        : publicClient.readContract({
            address: from.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account.address!],
          }),
  });
  const quote = useQuery({
    queryKey: ["swap-quote", route?.assets.map((a) => a.address).join(), amountIn?.toString()],
    enabled: !!route && !!amountIn,
    refetchInterval: 15000,
    retry: 1,
    queryFn: () => quoteSwap(route!, amountIn!, side === "sell"),
  });
  // Selling an ERC20 goes through Permit2: the token approves Permit2, Permit2 approves the router.
  const allowance = useQuery({
    queryKey: ["swap-allowance", account.address, from.address],
    enabled: !!account.address && !isEth(from.address),
    queryFn: async () => {
      const [erc20, permit] = await Promise.all([
        publicClient.readContract({
          address: from.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account.address!, CONTRACTS.permit2],
        }),
        publicClient.readContract({
          address: CONTRACTS.permit2,
          abi: permit2Abi,
          functionName: "allowance",
          args: [account.address!, from.address, CONTRACTS.universalRouter],
        }),
      ]);
      return { erc20, permit2: permit[0], expiration: Number(permit[1]) };
    },
  });
  const needsErc20 =
    !!amountIn && !!allowance.data && allowance.data.erc20 < amountIn;
  const needsPermit2 =
    !!amountIn &&
    !!allowance.data &&
    (allowance.data.permit2 < amountIn ||
      allowance.data.expiration < Date.now() / 1000 + 300);
  const insufficient =
    !!amountIn && balance.data !== undefined && balance.data < amountIn;
  const quoted = quote.data;
  const minOut = quoted !== undefined ? minimumOut(quoted, slippage) : undefined;
  const wrongChain = account.isConnected && account.chainId !== activeChain.id;
  const routeLabel = route?.assets.map((a) => a.symbol).join(" → ");

  async function approve() {
    const request: TxRequest = needsErc20
      ? {
          address: from.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.permit2, maxUint256],
        }
      : {
          address: CONTRACTS.permit2,
          abi: permit2Abi,
          functionName: "approve",
          args: [
            from.address,
            CONTRACTS.universalRouter,
            maxUint160,
            Math.floor(Date.now() / 1000) + 30 * 86400,
          ],
        };
    const receipt = await approval.run(request);
    if (receipt) await allowance.refetch();
  }
  function prepare() {
    setPrepError("");
    if (!route || !amountIn || quoted === undefined || minOut === undefined) return;
    if (minOut <= 0n) {
      setPrepError("This amount is too small to receive any output.");
      return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
    const call = encodeSwap(route, amountIn, minOut, deadline);
    tx.reset();
    setReview({
      amountIn,
      quoted,
      minOut,
      route: route.assets,
      request: {
        address: CONTRACTS.universalRouter,
        abi: routerAbi,
        functionName: "execute",
        args: call.args,
        value: call.value,
      },
    });
  }
  async function confirm() {
    if (!review || !route) return;
    const receipt = await tx.run(review.request, async () => {
      const fresh = await quoteSwap(route, review.amountIn, side === "sell");
      if (fresh < review.minOut)
        throw new Error(
          "The price moved beyond your slippage limit. Close this review and check the new quote.",
        );
    });
    if (receipt) {
      setAmount("");
      client.invalidateQueries({ queryKey: ["swap-balance"] });
      client.invalidateQueries({ queryKey: ["swap-allowance"] });
      client.invalidateQueries({ queryKey: ["cg-pool"] });
    }
  }
  function flip() {
    setSide(side === "buy" ? "sell" : "buy");
    setAmount(quoted !== undefined ? formatUnits(quoted, to.decimals) : "");
  }

  const counterSelect = (label: string) =>
    hasBase ? (
      <select
        aria-label={label}
        className="asset-select"
        value={counter}
        onChange={(e) => setCounter(e.target.value as "eth" | "base")}
      >
        <option value="eth">ETH</option>
        <option value="base">{base.symbol}</option>
      </select>
    ) : (
      <span className="asset-chip">ETH</span>
    );

  let action: { label: string; onClick?: () => void; disabled?: boolean };
  if (!pools) action = { label: "Market not launched", disabled: true };
  else if (!account.isConnected) action = { label: "Connect wallet", onClick: openWallet };
  else if (wrongChain)
    action = {
      label: switchChain.isPending ? "Switching…" : `Switch to ${NETWORK.label}`,
      onClick: () =>
        switchChain.mutateAsync({ chainId: activeChain.id }).catch((e) => setPrepError(errorMessage(e))),
      disabled: switchChain.isPending,
    };
  else if (!amountIn) action = { label: "Enter an amount", disabled: true };
  else if (insufficient) action = { label: `Not enough ${from.symbol}`, disabled: true };
  else if (needsErc20 || needsPermit2)
    action = {
      label: approval.busy
        ? "Approving…"
        : needsErc20
          ? `Allow Permit2 to use ${from.symbol}`
          : `Approve ${from.symbol} for the router`,
      onClick: approve,
      disabled: approval.busy,
    };
  else if (quote.isPending) action = { label: "Getting quote…", disabled: true };
  else if (quote.isError || !quoted)
    action = { label: "No quote available", disabled: true };
  else action = { label: "Review swap", onClick: prepare };

  return (
    <section className="swap-panel" aria-labelledby="swap-title">
      <div className="swap-top">
        <h2 id="swap-title">Swap</h2>
        <div className="side-tabs" role="group" aria-label="Trade direction">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              className={side === s ? "active" : ""}
              onClick={() => setSide(s)}
            >
              {s === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`}
            </button>
          ))}
        </div>
      </div>
      <form
        className="swap-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          action.onClick?.();
        }}
      >
        <div className={`swap-box${inputError ? " invalid" : ""}`}>
          <label htmlFor="swap-amount">You pay</label>
          <div className="swap-row">
            <input
              id="swap-amount"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              aria-invalid={!!inputError}
              aria-describedby="swap-amount-hint"
            />
            {side === "buy" ? counterSelect("Pay with") : <span className="asset-chip">{token.symbol}</span>}
          </div>
          <p id="swap-amount-hint" className={inputError ? "field-error" : "swap-meta"} role={inputError ? "alert" : undefined}>
            {inputError ||
              (account.address && balance.data !== undefined ? (
                <>
                  Balance {amountText(balance.data, from.decimals)} {from.symbol}
                  {!isEth(from.address) && balance.data > 0n && (
                    <button
                      type="button"
                      className="inline-button"
                      onClick={() => setAmount(formatUnits(balance.data!, from.decimals))}
                    >
                      Max
                    </button>
                  )}
                </>
              ) : (
                `Enter a ${from.symbol} amount to see what you receive.`
              ))}
          </p>
        </div>
        <button type="button" className="swap-flip" onClick={flip} aria-label="Switch pay and receive">
          <ArrowDown size={18} aria-hidden="true" />
        </button>
        <div className="swap-box output">
          <span id="swap-out-label" className="swap-label">You receive</span>
          <div className="swap-row">
            <output aria-labelledby="swap-out-label" aria-live="polite" className={quote.isFetching ? "quote fetching" : "quote"}>
              {quoted !== undefined && amountIn ? amountText(quoted, to.decimals) : "0.0"}
            </output>
            {side === "sell" ? counterSelect("Receive") : <span className="asset-chip">{token.symbol}</span>}
          </div>
          <p className="swap-meta">
            {quote.isError
              ? errorMessage(quote.error).includes("could not be reached")
                ? errorMessage(quote.error)
                : "The pool cannot fill this amount. Try a smaller amount."
              : quoted === 0n && amountIn
                ? `The pool holds no ${to.symbol} to pay for this sale yet. Sales open once people buy.`
                : `Estimated after the current ${taxBps / 100}% token tax.`}
          </p>
        </div>
        <dl className="swap-details">
          <div>
            <dt>Route</dt>
            <dd>
              {routeLabel || "—"}
              {route && route.pools.length > 1 && <span className="status-badge">2 swaps</span>}
            </dd>
          </div>
          <div>
            <dt>Rate</dt>
            <dd>
              {quoted && amountIn
                ? `1 ${from.symbol} ≈ ${amountText((quoted * 10n ** BigInt(from.decimals)) / amountIn, to.decimals)} ${to.symbol}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Minimum received</dt>
            <dd>{minOut !== undefined && amountIn ? `${amountText(minOut, to.decimals)} ${to.symbol}` : "—"}</dd>
          </div>
        </dl>
        <fieldset className="slippage">
          <legend>Slippage limit</legend>
          <div className="chip-row">
            {SLIPPAGE.map((bps) => (
              <label key={bps} className={slippage === bps ? "chip active" : "chip"}>
                <input
                  type="radio"
                  name="slippage"
                  value={bps}
                  checked={slippage === bps}
                  onChange={() => setSlippage(bps)}
                />
                {bps / 100}%
              </label>
            ))}
          </div>
        </fieldset>
        {(prepError || approval.state.phase === "error") && (
          <Notice error>{prepError || approval.state.error}</Notice>
        )}
        <button className="button primary full" disabled={action.disabled} type="submit">
          {action.label}
          {!action.disabled && <ArrowRight size={18} aria-hidden="true" />}
        </button>
        <p className="field-hint">
          Swaps run through the Uniswap Universal Router. Quotes are simulated by Uniswap’s
          V4 Quoter against the live pool and refresh every 15 seconds.
        </p>
      </form>
      <Modal
        dismissible={!tx.busy}
        open={!!review}
        onClose={() => {
          if (!tx.busy) setReview(undefined);
        }}
        title="Review swap"
      >
        {review && (
          <>
            <dl className="swap-details review">
              <div>
                <dt>You pay</dt>
                <dd>
                  {displayAmount(review.amountIn, review.route[0].decimals)} {review.route[0].symbol}
                </dd>
              </div>
              <div>
                <dt>Expected</dt>
                <dd>
                  {amountText(review.quoted, review.route[review.route.length - 1].decimals)}{" "}
                  {review.route[review.route.length - 1].symbol}
                </dd>
              </div>
              <div>
                <dt>Minimum ({slippage / 100}% limit)</dt>
                <dd>
                  {amountText(review.minOut, review.route[review.route.length - 1].decimals)}{" "}
                  {review.route[review.route.length - 1].symbol}
                </dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>{review.route.map((a) => a.symbol).join(" → ")}</dd>
              </div>
            </dl>
            <p className="field-hint">
              {activeChain.name} · Universal Router · expires in 20 minutes
            </p>
            <AddressValue address={CONTRACTS.universalRouter as Address} />
          </>
        )}
        <TransactionStatus state={tx.state} reset={tx.reset} checkReceipt={tx.checkReceipt} />
        {tx.state.phase === "success" ? (
          <button className="button primary full" onClick={() => setReview(undefined)}>
            Done
            <CheckCircle2 size={18} />
          </button>
        ) : (
          <button
            className="button primary full"
            onClick={confirm}
            disabled={tx.busy || !!tx.state.hash || wrongChain}
          >
            {tx.busy ? "Transaction in progress…" : "Confirm in wallet"}
            <ArrowRight size={18} />
          </button>
        )}
        <p className="field-hint">
          The quote is refreshed and the swap simulated before your wallet asks you to sign.
        </p>
      </Modal>
    </section>
  );
}
