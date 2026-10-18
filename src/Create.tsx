import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { decodeEventLog, formatUnits, isAddress, type Address } from "viem";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Info,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  BASES,
  CONTRACTS,
  NATIVE_ETH,
  factoryAbi,
  tokenCreatedEvent,
} from "./contracts";
import { eligibleBase, previewLaunch, verifyInfrastructure } from "./chain";
import {
  allocationAmounts,
  buildConfig,
  decayDuration,
  defaultDraft,
  displayAmount,
  displayNumber,
  draftErrors,
  duration,
  errorMessage,
  parseDecimal,
  percentBps,
  type LaunchDraft,
} from "./model";
import { AddressValue, Busy, Field, Notice, Stat } from "./ui";
import { useOpenWallet } from "./wallet";
import { TransactionStatus, useTransaction } from "./transactions";
import { activeChain, NETWORK } from "./networks";
import {
  initialPriceSettings,
  assertFreshQuote,
  impliedMarketCap,
  type UsdQuote,
} from "./pricing";
import { StartingPrice, useStartingPrice, dollars } from "./StartingPrice";

function TokenArt() {
  return (
    <svg
      className="token-art"
      viewBox="0 0 440 222"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M36 178h368M36 134h368M36 90h368M80 38v155M150 38v155M220 38v155M290 38v155M360 38v155"
        stroke="currentColor"
        opacity=".075"
      />
      <ellipse cx="231" cy="179" rx="93" ry="15" fill="#262b26" opacity=".07" />
      <g transform="rotate(-18 220 110)">
        <ellipse
          cx="226"
          cy="120"
          rx="77"
          ry="85"
          fill="#d34427"
          stroke="#292e26"
          strokeWidth="1.5"
        />
        <path
          d="m279 59 7 9m3 6 7 9m-5 10 9 9m-8 12 10 8m-12 12 10 7m-16 12 10 6m-19 11 9 5m-19 5 7 4"
          stroke="#8e2d18"
        />
        <ellipse
          cx="217"
          cy="112"
          rx="77"
          ry="85"
          fill="#f27752"
          stroke="#292e26"
          strokeWidth="1.5"
        />
        <ellipse cx="217" cy="112" rx="66" ry="74" stroke="#a83c22" />
        <ellipse
          cx="217"
          cy="112"
          rx="61"
          ry="69"
          stroke="#a83c22"
          strokeDasharray="1 6"
        />
        <g fill="#fff8e9" transform="translate(183 74)">
          <path d="M29 0h10v76H29z" />
          <path d="m0 23 5-9 66 38-5 9z" />
          <path d="m5 61-5-9 66-38 5 9z" />
        </g>
      </g>
      <path
        d="m328 50 5 13 13 5-13 5-5 13-5-13-13-5 13-5ZM105 127l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"
        fill="#292e26"
      />
      <path d="m341 153 16-16m-8 16 16-16" stroke="#292e26" strokeWidth="1.5" />
    </svg>
  );
}
export function TaxChart({ tax, interval }: { tax: number; interval: number }) {
  const total = decayDuration(percentBps(tax), interval);
  const steps = Math.ceil(99 - tax);
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const x = 22 + (i * 307) / steps;
    const rate = Math.max(tax, 99 - i);
    return i === 0
      ? `${x},${126 - rate * 1.06}`
      : `${x},${126 - Math.max(tax, 100 - i) * 1.06} ${x},${126 - rate * 1.06}`;
  }).join(" ");
  return (
    <div className="tax-chart">
      <div className="row-between">
        <strong>99% at launch</strong>
        <span>{tax}% resting</span>
      </div>
      <svg
        role="img"
        aria-label={`Tax drops from 99 percent to ${tax} percent over ${duration(total)}`}
        viewBox="0 0 350 140"
      >
        <path
          d="M22 24H330M22 76H330M22 126H330"
          stroke="currentColor"
          opacity=".13"
          strokeDasharray="3 5"
        />
        <polyline
          points={pts}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="21" r="4" fill="var(--color-accent)" />
        <path d="M329 126h-12" stroke="var(--color-accent)" strokeWidth="2.5" />
      </svg>
      <div className="row-between field-hint">
        <span>Launch</span>
        <span>Resting after {duration(total)}</span>
      </div>
    </div>
  );
}
export function Create({ active = true }: { active?: boolean }) {
  const [draft, setDraft] = useState<LaunchDraft>(defaultDraft);
  const [step, setStep] = useState(0);
  const [priceSettings, setPriceSettings] = useState(initialPriceSettings);
  const [reviewPrice, setReviewPrice] = useState<{
    price: string;
    quote?: UsdQuote;
  }>();
  let supply = 0n;
  try {
    supply = parseDecimal(draft.supply, 18);
  } catch {
    /* Inline validation handles invalid supply. */
  }
  const pricing = useStartingPrice(
    supply,
    draft.base,
    priceSettings,
    active && step === 1 && draft.mode === "now",
    step === 1,
  );
  const startingPrice =
    step === 2 && reviewPrice ? reviewPrice.price : pricing.price;
  const launchDraft = { ...draft, price: startingPrice };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState(false);
  const [customAddress, setCustomAddress] = useState("");
  const [customError, setCustomError] = useState("");
  const [checking, setChecking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [created, setCreated] = useState<Address>();
  const heading = useRef<HTMLHeadingElement>(null);
  const account = useConnection();
  const openWallet = useOpenWallet();
  const tx = useTransaction();
  const update = <K extends keyof LaunchDraft>(
    key: K,
    value: LaunchDraft[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key === "base") setPriceSettings((p) => ({ ...p, manualPrice: "" }));
    setErrors((e) => ({ ...e, [key]: "" }));
    setAccepted(false);
  };
  const valid =
    !Object.keys(draftErrors(launchDraft, 0)).length &&
    !Object.keys(draftErrors(launchDraft, 1)).length;
  const preview = useQuery({
    queryKey: [
      "launch-preview",
      draft.supply,
      draft.allocation,
      startingPrice,
      draft.base.address,
    ],
    queryFn: async () => {
      const supply = parseDecimal(draft.supply, 18),
        price = parseDecimal(startingPrice, draft.base.decimals),
        bps = percentBps(draft.allocation);
      const first = await previewLaunch(supply, bps, price, false);
      const second =
        draft.base.address === NATIVE_ETH
          ? first
          : await previewLaunch(supply, bps, price, true);
      return [first, second];
    },
    enabled: active && step > 0 && valid && draft.mode === "now",
    retry: 1,
    staleTime: 60000,
  });
  const baseCheck = useQuery({
    queryKey: ["base", draft.base.address],
    queryFn: () => eligibleBase(draft.base.address),
    enabled: active && step > 0,
    retry: 1,
    staleTime: 30000,
  });
  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);
  useEffect(() => setAccepted(false), [account.address, account.chainId]);
  useEffect(() => {
    if (tx.state.phase !== "success" || !tx.state.receipt) return;
    for (const log of tx.state.receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACTS.factory) continue;
      try {
        const decoded = decodeEventLog({
          abi: [tokenCreatedEvent],
          data: log.data,
          topics: log.topics,
        });
        setCreated(decoded.args.token);
      } catch {
        // Receipt logs from other events do not identify the new token.
      }
    }
  }, [tx.state.phase, tx.state.receipt]);
  async function chooseCustom() {
    setCustomError("");
    if (
      !isAddress(customAddress) ||
      customAddress.toLowerCase() === NATIVE_ETH
    ) {
      setCustomError("Paste a valid ERC-20 contract address.");
      return;
    }
    setChecking(true);
    try {
      update("base", await eligibleBase(customAddress));
      setCustom(false);
    } catch (e) {
      setCustomError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }
  function next(event: FormEvent) {
    event.preventDefault();
    if (step === 1 && custom) {
      setCustomError("Check this base’s eligibility, or choose a listed base.");
      document.getElementById("custom-base")?.focus();
      return;
    }
    const problems = draftErrors(launchDraft, step);
    if (
      step === 1 &&
      draft.mode === "now" &&
      priceSettings.mode === "marketcap"
    ) {
      if (!startingPrice || pricing.problem)
        problems.price =
          pricing.problem ||
          "Wait for a current base-token price, then review again.";
      else if (pricing.quote.data) {
        try {
          assertFreshQuote(pricing.quote.data);
        } catch (e) {
          problems.price = errorMessage(e);
        }
      }
    }
    setErrors(problems);
    if (Object.keys(problems).length) {
      const first = Object.keys(problems)[0];
      if (first === "price")
        (
          document.getElementById("create-price-price") ||
          document.querySelector<HTMLInputElement>(
            'input[name="create-price-cap"]:checked',
          )
        )?.focus();
      else document.getElementById(first)?.focus();
      return;
    }
    if (step === 1)
      setReviewPrice({
        price: startingPrice,
        quote:
          priceSettings.mode === "marketcap" ? pricing.quote.data : undefined,
      });
    setStep((s) => Math.min(2, s + 1));
  }
  async function submit() {
    if (!account.isConnected) {
      openWallet();
      return;
    }
    if (!account.address || !accepted || account.chainId !== activeChain.id)
      return;
    if (reviewPrice?.quote) {
      try {
        assertFreshQuote(reviewPrice.quote);
      } catch (e) {
        setErrors({ price: errorMessage(e) });
        return;
      }
    }
    const config = buildConfig(launchDraft, account.address);
    await tx.run(
      {
        address: CONTRACTS.factory,
        abi: factoryAbi,
        functionName:
          draft.mode === "now" ? "createAndLaunchAtPrice" : "create",
        args:
          draft.mode === "now"
            ? [
                config,
                percentBps(draft.allocation),
                parseDecimal(startingPrice, draft.base.decimals),
              ]
            : [config],
        ...(draft.mode === "now" ? { value: 0n } : {}),
      },
      async () => {
        if (reviewPrice?.quote) assertFreshQuote(reviewPrice.quote);
        await verifyInfrastructure();
        await eligibleBase(draft.base.address);
      },
      () => {
        if (reviewPrice?.quote) assertFreshQuote(reviewPrice.quote);
      },
    );
  }
  let amounts = { creator: 0n, liquidity: 0n };
  try {
    amounts = allocationAmounts(
      parseDecimal(draft.supply, 18),
      percentBps(draft.allocation),
    );
  } catch {
    /* An invalid field is explained beside its input. */
  }
  const effectivePrices = preview.data?.map((p) => p.effectivePriceWei);
  const sorted = effectivePrices
    ?.slice()
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const feeRecipient = draft.feeRecipient || account.address;
  const decayRecipient = draft.decayRecipient || feeRecipient;
  return (
    <>
      <div className="page-heading create-heading">
        <div>
          <h1>
            Your token.
            <br className="mobile-break" /> Its own market
            <span className="accent-period">.</span>
          </h1>
          <p>Launch on {NETWORK.label} with token-only liquidity.</p>
        </div>
        <a className="text-link learn-link" href="#/how-it-works">
          How it works <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="workspace">
        <section className="form-panel" aria-label="Create a token">
          <ol className="steps" aria-label="Launch progress">
            {["Token", "Launch", "Review"].map((s, i) => (
              <li
                key={s}
                className={step === i ? "active" : step > i ? "completed" : ""}
              >
                <button
                  type="button"
                  disabled={i > step || tx.busy}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => setStep(i)}
                >
                  <span className="step-number">
                    {i < step ? <Check size={14} /> : i + 1}
                  </span>
                  {s}
                </button>
                {i < 2 && <ChevronRight size={16} aria-hidden="true" />}
              </li>
            ))}
          </ol>
          {created ? (
            <div className="form-body success-body">
              <CheckCircle2 size={44} />
              <h2>
                {draft.mode === "now"
                  ? "Your market is open."
                  : "Your token is deployed."}
              </h2>
              <p>
                {draft.mode === "now"
                  ? `Your token and its permanently locked pool are live on ${NETWORK.label}.`
                  : "Open the owner console to choose a starting price and launch your pool."}
              </p>
              <AddressValue address={created} />
              <a className="button primary full" href={`#/token/${created}`}>
                Open token
                <ArrowRight size={18} />
              </a>
              <TransactionStatus state={tx.state} />
            </div>
          ) : (
            <form onSubmit={next} noValidate className="form-body">
              <div className="section-heading">
                <span className="section-icon">
                  {step === 0 ? (
                    <Coins size={20} />
                  ) : step === 1 ? (
                    <Rocket size={20} />
                  ) : (
                    <ShieldCheck size={20} />
                  )}
                </span>
                <div>
                  <h2 ref={heading} tabIndex={-1}>
                    {
                      [
                        "Make it yours",
                        "Shape your launch",
                        `Ready for ${NETWORK.label}`,
                      ][step]
                    }
                  </h2>
                  <p>
                    {
                      [
                        "Start with a name, a symbol, and a fixed supply.",
                        "Set the market, allocation, and fee structure.",
                        "Check the details before you sign.",
                      ][step]
                    }
                  </p>
                </div>
              </div>
              {step === 0 && (
                <>
                  <div className="field-grid token-fields">
                    <Field id="name" label="Token name" error={errors.name}>
                      <input
                        id="name"
                        name="name"
                        autoComplete="off"
                        maxLength={64}
                        placeholder="e.g. Moon Garden"
                        value={draft.name}
                        onChange={(e) => update("name", e.target.value)}
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? "name-hint" : undefined}
                      />
                    </Field>
                    <Field id="symbol" label="Symbol" error={errors.symbol}>
                      <input
                        id="symbol"
                        name="symbol"
                        autoComplete="off"
                        maxLength={16}
                        placeholder="e.g. GARDEN"
                        value={draft.symbol}
                        onChange={(e) => update("symbol", e.target.value)}
                        aria-invalid={!!errors.symbol}
                        aria-describedby={
                          errors.symbol ? "symbol-hint" : undefined
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    id="supply"
                    label="Total supply"
                    hint="Fixed at deployment · 18 decimals"
                    error={errors.supply}
                  >
                    <input
                      id="supply"
                      name="supply"
                      inputMode="decimal"
                      value={draft.supply}
                      onChange={(e) => update("supply", e.target.value)}
                      aria-invalid={!!errors.supply}
                      aria-describedby="supply-hint"
                    />
                  </Field>
                  <fieldset className="launch-mode">
                    <legend>When do you want to launch?</legend>
                    <label
                      className={
                        draft.mode === "now"
                          ? "mode-option selected"
                          : "mode-option"
                      }
                    >
                      <input
                        type="radio"
                        name="launch-mode"
                        checked={draft.mode === "now"}
                        onChange={() => update("mode", "now")}
                      />
                      <span>
                        <strong>Deploy & launch</strong>
                        <small>One transaction.</small>
                      </span>
                      <Rocket size={20} aria-hidden="true" />
                    </label>
                    <label
                      className={
                        draft.mode === "later"
                          ? "mode-option selected"
                          : "mode-option"
                      }
                    >
                      <input
                        type="radio"
                        name="launch-mode"
                        checked={draft.mode === "later"}
                        onChange={() => update("mode", "later")}
                      />
                      <span>
                        <strong>Deploy first</strong>
                        <small>Launch when ready.</small>
                      </span>
                      <Coins size={20} aria-hidden="true" />
                    </label>
                  </fieldset>
                </>
              )}
              {step === 1 && (
                <>
                  <fieldset className="base-field">
                    <legend>Pair with</legend>
                    <div className="base-options">
                      {BASES.map((b) => (
                        <button
                          key={b.symbol}
                          type="button"
                          className={`base-option ${draft.base.address === b.address && !custom ? "selected" : ""}`}
                          aria-pressed={
                            draft.base.address === b.address && !custom
                          }
                          onClick={() => {
                            update("base", b);
                            setCustom(false);
                          }}
                        >
                          <span
                            className={`base-mark ${b.symbol.toLowerCase()}`}
                            aria-hidden="true"
                          >
                            {b.symbol === "ETH" ? (
                              <svg viewBox="0 0 20 28">
                                <path
                                  d="m10 0 9 15-9 5-9-5ZM1 17l9 11 9-11-9 5Z"
                                  fill="currentColor"
                                />
                              </svg>
                            ) : b.symbol === "IMD" ? (
                              <Sparkles size={17} />
                            ) : (
                              <span>ƒ</span>
                            )}
                          </span>
                          {b.symbol}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`base-option ${custom || !BASES.some((b) => b.address === draft.base.address) ? "selected" : ""}`}
                        aria-pressed={custom}
                        onClick={() => setCustom(!custom)}
                      >
                        Other
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </fieldset>
                  {custom && (
                    <div className="custom-base">
                      <Field
                        id="custom-base"
                        label="Base token address"
                        error={customError}
                        hint="Enabled external bases or ETH-paired ERC20T tokens with pairing permission."
                      >
                        <input
                          id="custom-base"
                          inputMode="text"
                          placeholder="0x…"
                          value={customAddress}
                          onChange={(e) => setCustomAddress(e.target.value)}
                          aria-invalid={!!customError}
                          aria-describedby="custom-base-hint"
                        />
                      </Field>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={checking}
                        onClick={chooseCustom}
                      >
                        {checking ? "Checking…" : "Check eligibility"}
                      </button>
                    </div>
                  )}
                  {!BASES.some((b) => b.address === draft.base.address) && (
                    <p className="selected-base">
                      Selected: {draft.base.symbol}
                      <span className="address">{draft.base.address}</span>
                    </p>
                  )}
                  {baseCheck.isPending ? (
                    <Busy text="Checking base eligibility…" />
                  ) : baseCheck.error ? (
                    <Notice error>
                      {errorMessage(baseCheck.error)}{" "}
                      <button
                        type="button"
                        className="inline-button"
                        onClick={() => baseCheck.refetch()}
                      >
                        Retry
                      </button>
                    </Notice>
                  ) : (
                    <p className="inline-success">
                      <CheckCircle2 size={15} />
                      {draft.base.symbol} is eligible for this launch
                    </p>
                  )}
                  {draft.mode === "now" ? (
                    <StartingPrice
                      id="create-price"
                      base={draft.base}
                      settings={priceSettings}
                      onChange={(value) => {
                        setPriceSettings(value);
                        setAccepted(false);
                        setErrors((e) => ({ ...e, price: "" }));
                      }}
                      price={pricing.price}
                      quote={pricing.quote.data}
                      problem={pricing.problem}
                      pending={pricing.quote.isPending}
                      fetching={pricing.quote.isFetching}
                      refresh={() => pricing.quote.refetch()}
                      error={errors.price}
                    />
                  ) : (
                    <Notice>
                      You’ll choose a starting market cap when you launch from
                      the owner console. The base token is fixed at deployment.
                    </Notice>
                  )}
                  <div className="range-field">
                    <div className="row-between">
                      <label htmlFor="allocation">Creator allocation</label>
                      <output htmlFor="allocation">{draft.allocation}%</output>
                    </div>
                    <input
                      id="allocation"
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={draft.allocation}
                      onChange={(e) =>
                        update("allocation", Number(e.target.value))
                      }
                      aria-describedby="allocation-hint"
                    />
                    <div className="row-between field-hint">
                      <span>0%</span>
                      <span>20% maximum</span>
                    </div>
                    <p className="field-hint" id="allocation-hint">
                      {100 - draft.allocation}% seeds permanently locked
                      liquidity.
                    </p>
                  </div>
                  <div className="range-field">
                    <div className="row-between">
                      <label htmlFor="tax">Resting buy / sell tax</label>
                      <output htmlFor="tax">{draft.tax}%</output>
                    </div>
                    <input
                      id="tax"
                      type="range"
                      min="0.3"
                      max="5"
                      step="0.1"
                      value={draft.tax}
                      onChange={(e) => update("tax", Number(e.target.value))}
                    />
                    <div className="row-between field-hint">
                      <span>0.3%</span>
                      <span>5%</span>
                    </div>
                  </div>
                  <div className="decay-option">
                    <label className="switch-label">
                      <span>
                        <strong>Launch tax decay</strong>
                        <small>
                          Start at 99%, then settle to {draft.tax}%.
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        role="switch"
                        checked={draft.decay}
                        onChange={(e) => update("decay", e.target.checked)}
                      />
                      <span className="switch-track" aria-hidden="true" />
                    </label>
                    {draft.decay && (
                      <div className="decay-details">
                        <Field
                          id="interval"
                          label="Seconds per 1 percentage point drop"
                          error={errors.interval}
                        >
                          <input
                            id="interval"
                            name="interval"
                            inputMode="numeric"
                            value={draft.interval}
                            onChange={(e) => update("interval", e.target.value)}
                            aria-invalid={!!errors.interval}
                            aria-describedby={
                              errors.interval ? "interval-hint" : undefined
                            }
                          />
                        </Field>
                        {Number(draft.interval) > 0 && (
                          <TaxChart
                            tax={draft.tax}
                            interval={+draft.interval}
                          />
                        )}
                        <p className="field-hint">
                          The clock starts at launch. Resting tax cannot be
                          changed during active decay.
                        </p>
                      </div>
                    )}
                  </div>
                  <details className="recipient-details">
                    <summary>
                      Fee recipients
                      <span>
                        Optional
                        <ChevronRight size={16} />
                      </span>
                    </summary>
                    <p className="field-hint">
                      Regular fees default to your connected wallet. Decay fees
                      default to the regular recipient. You can change them
                      independently later.
                    </p>
                    <Field
                      id="feeRecipient"
                      label="Regular fee recipient"
                      error={errors.feeRecipient}
                    >
                      <input
                        id="feeRecipient"
                        placeholder="Connected wallet"
                        value={draft.feeRecipient}
                        onChange={(e) =>
                          update("feeRecipient", e.target.value.trim())
                        }
                        aria-invalid={!!errors.feeRecipient}
                        aria-describedby={
                          errors.feeRecipient ? "feeRecipient-hint" : undefined
                        }
                      />
                    </Field>
                    {draft.decay && (
                      <Field
                        id="decayRecipient"
                        label="Decay fee recipient"
                        error={errors.decayRecipient}
                      >
                        <input
                          id="decayRecipient"
                          placeholder="Same as regular recipient"
                          value={draft.decayRecipient}
                          onChange={(e) =>
                            update("decayRecipient", e.target.value.trim())
                          }
                          aria-invalid={!!errors.decayRecipient}
                          aria-describedby={
                            errors.decayRecipient
                              ? "decayRecipient-hint"
                              : undefined
                          }
                        />
                      </Field>
                    )}
                  </details>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="review-token">
                    <span className="review-token-mark">
                      <Coins size={28} />
                    </span>
                    <div>
                      <h3>{draft.name}</h3>
                      <span className="muted">
                        {draft.symbol} · {NETWORK.label}
                      </span>
                    </div>
                  </div>
                  <dl className="review-list">
                    <div>
                      <dt>Action</dt>
                      <dd>
                        {draft.mode === "now"
                          ? "Deploy and launch"
                          : "Deploy only"}
                      </dd>
                    </div>
                    <div>
                      <dt>Total supply</dt>
                      <dd>{displayAmount(parseDecimal(draft.supply, 18))}</dd>
                    </div>
                    <div>
                      <dt>Base token</dt>
                      <dd>{draft.base.symbol}</dd>
                    </div>
                    {draft.mode === "now" &&
                      priceSettings.mode === "marketcap" && (
                        <div>
                          <dt>Target market cap</dt>
                          <dd>~{dollars(priceSettings.marketCap)}</dd>
                        </div>
                      )}
                    {draft.mode === "now" && (
                      <div>
                        <dt>Requested starting price</dt>
                        <dd>
                          {startingPrice} {draft.base.symbol}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>To creator</dt>
                      <dd>{draft.allocation}%</dd>
                    </div>
                    <div>
                      <dt>To locked liquidity</dt>
                      <dd>{100 - draft.allocation}%</dd>
                    </div>
                    <div>
                      <dt>Buy / sell tax at launch</dt>
                      <dd>{draft.decay ? 99 : draft.tax}%</dd>
                    </div>
                    <div>
                      <dt>Resting tax</dt>
                      <dd>{draft.tax}%</dd>
                    </div>
                    <div>
                      <dt>Base deposit</dt>
                      <dd>None required</dd>
                    </div>
                  </dl>
                  {draft.mode === "now" && (
                    <div className="contract-preview">
                      <strong>Contract price preview</strong>
                      {reviewPrice?.quote && (
                        <p className="field-hint">
                          {reviewPrice.quote.source} · 1 {draft.base.symbol} ={" "}
                          {dollars(Number(reviewPrice.quote.usd))}. Quote fixed
                          at{" "}
                          {new Date(
                            reviewPrice.quote.fetchedAt,
                          ).toLocaleTimeString()}
                          ; quotes must be under 5 minutes old when you sign. Go
                          back to refresh.
                        </p>
                      )}
                      {errors.price && <Notice error>{errors.price}</Notice>}
                      {preview.isPending ? (
                        <Busy text="Reading the factory preview…" />
                      ) : preview.error ? (
                        <Notice error>
                          {errorMessage(preview.error)}{" "}
                          <button
                            type="button"
                            className="inline-button"
                            onClick={() => preview.refetch()}
                          >
                            Retry preview
                          </button>
                        </Notice>
                      ) : (
                        sorted && (
                          <>
                            <p className="price-value">
                              {formatUnits(sorted[0], draft.base.decimals)}
                              {sorted[0] !== sorted[1]
                                ? ` – ${formatUnits(sorted[1], draft.base.decimals)}`
                                : ""}{" "}
                              {draft.base.symbol}
                            </p>
                            {reviewPrice?.quote && (
                              <p className="field-hint">
                                Approximate market cap after tick alignment:{" "}
                                {dollars(
                                  Number(
                                    impliedMarketCap(
                                      sorted[0],
                                      supply,
                                      reviewPrice.quote.usd,
                                      draft.base.decimals,
                                    ),
                                  ),
                                )}
                                {sorted[0] !== sorted[1]
                                  ? ` – ${dollars(Number(impliedMarketCap(sorted[1], supply, reviewPrice.quote.usd, draft.base.decimals)))}`
                                  : ""}
                                .
                              </p>
                            )}
                            <p className="field-hint">
                              {draft.base.address === NATIVE_ETH
                                ? "Per whole token, rounded to the pool’s tick spacing."
                                : "Per whole token. The exact tick depends on the new token’s address ordering, resolved inside the transaction."}
                            </p>
                          </>
                        )
                      )}
                    </div>
                  )}
                  <div className="review-recipients">
                    <strong>Owner & recipients</strong>
                    <p className="field-hint">
                      The connected wallet will own this token.
                    </p>
                    {account.address ? (
                      <AddressValue address={account.address} />
                    ) : (
                      <p className="muted">
                        Connect your wallet to set the owner.
                      </p>
                    )}
                    <span className="field-hint">Regular fee recipient</span>
                    {feeRecipient ? (
                      <AddressValue address={feeRecipient} />
                    ) : (
                      <p className="muted">Connected wallet</p>
                    )}
                    {draft.decay && (
                      <>
                        <span className="field-hint">Decay fee recipient</span>
                        {decayRecipient ? (
                          <AddressValue address={decayRecipient} />
                        ) : (
                          <p className="muted">Same as regular recipient</p>
                        )}
                      </>
                    )}
                  </div>
                  <Notice>
                    <strong>
                      {draft.mode === "now"
                        ? "Launch liquidity is locked forever."
                        : "Supply and base token are fixed at deployment."}
                    </strong>
                    <br />
                    {draft.mode === "now"
                      ? "The initial liquidity position cannot be withdrawn."
                      : "Liquidity is reserved inside the token until the owner launches."}{" "}
                    You pay gas in ETH on {NETWORK.label}; no base deposit is
                    required.
                  </Notice>
                  <label className="acceptance">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    <span>
                      I reviewed the configuration and understand that{" "}
                      {draft.mode === "now"
                        ? "the initial liquidity is permanently locked"
                        : "launching later will permanently lock the initial liquidity"}
                      .
                    </span>
                  </label>
                  {account.isConnected &&
                    account.chainId !== activeChain.id && (
                      <Notice error>
                        Switch to {NETWORK.label} using the wallet control
                        above.
                      </Notice>
                    )}
                  {baseCheck.error && (
                    <Notice error>
                      {errorMessage(baseCheck.error)}{" "}
                      <button
                        type="button"
                        className="inline-button"
                        onClick={() => baseCheck.refetch()}
                      >
                        Retry eligibility
                      </button>
                    </Notice>
                  )}
                  <TransactionStatus
                    state={tx.state}
                    checkReceipt={tx.checkReceipt}
                    reset={() => {
                      tx.reset();
                      setAccepted(false);
                    }}
                  />
                </>
              )}
              <div className="form-actions">
                {step > 0 && (
                  <button
                    type="button"
                    className="button secondary back-button"
                    disabled={tx.busy}
                    onClick={() => setStep((s) => s - 1)}
                  >
                    <ArrowLeft size={18} />
                    Back
                  </button>
                )}
                {step < 2 ? (
                  <button className="button primary" type="submit">
                    {step === 0 ? "Continue to launch" : "Review token"}
                    <ArrowRight size={18} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    type="button"
                    onClick={submit}
                    disabled={
                      tx.busy ||
                      !!tx.state.hash ||
                      !!baseCheck.error ||
                      baseCheck.isPending ||
                      (draft.mode === "now" && !preview.data) ||
                      (account.isConnected &&
                        (!accepted || account.chainId !== activeChain.id))
                    }
                  >
                    {tx.busy
                      ? "Transaction in progress…"
                      : !account.isConnected
                        ? "Connect to continue"
                        : draft.mode === "now"
                          ? "Deploy & launch token"
                          : "Deploy token"}
                    {!tx.busy && <ArrowRight size={18} />}
                  </button>
                )}
              </div>
              {step === 0 && (
                <p className="form-footnote">
                  <ShieldCheck size={14} />
                  No wallet needed to preview your launch.
                </p>
              )}
            </form>
          )}
        </section>
        <aside className="preview-panel" aria-label="Launch preview">
          <div className="preview-heading">
            <h2>Launch preview</h2>
            <span className="draft-label">Your configuration</span>
          </div>
          <TokenArt />
          <div className="preview-token">
            <h3>{draft.name || "Your next token"}</h3>
            <p>
              {draft.symbol || "Choose a name. Make it yours."}
              {draft.symbol && <span> / {draft.base.symbol}</span>}
            </p>
          </div>
          <div className="preview-stats">
            <Stat label="Total supply">
              {displayAmount(amounts.creator + amounts.liquidity)}
            </Stat>
            {draft.mode === "now" && priceSettings.mode === "marketcap" && (
              <Stat label="Target market cap">
                ~{dollars(priceSettings.marketCap)}
              </Stat>
            )}
            <Stat label="Starting price">
              {draft.mode === "later"
                ? "Set at launch"
                : startingPrice
                  ? `${startingPrice} ${draft.base.symbol}`
                  : "Calculated in the launch step"}
            </Stat>
          </div>
          <div className="allocation-preview">
            <div
              className="allocation-bar"
              role="img"
              aria-label={`${100 - draft.allocation}% locked liquidity, ${draft.allocation}% creator allocation`}
            >
              <span style={{ width: `${100 - draft.allocation}%` }} />
              <span style={{ width: `${draft.allocation}%` }} />
            </div>
            <div className="allocation-legend">
              <span>
                <i className="legend-dot liquidity" />
                Locked liquidity<strong>{100 - draft.allocation}%</strong>
              </span>
              <span>
                <i className="legend-dot creator" />
                Creator allocation<strong>{draft.allocation}%</strong>
              </span>
            </div>
          </div>
          <div className="fee-preview">
            <div className="row-between">
              <strong>Fees, paid in ETH</strong>
              <span className="tax-tag">{draft.tax}% resting</span>
            </div>
            <dl>
              <div>
                <dt>Protocol</dt>
                <dd>0.15%</dd>
              </div>
              <div>
                <dt>Regular recipient</dt>
                <dd>{displayNumber(draft.tax - 0.15, 2)}%</dd>
              </div>
              {draft.decay && (
                <div>
                  <dt>Decay recipient at launch</dt>
                  <dd>{displayNumber(99 - draft.tax, 2)}%</dd>
                </div>
              )}
            </dl>
            <p className="field-hint">
              The protocol component is included in the tax.
            </p>
          </div>
          <div className="preview-note">
            <LockKeyhole size={18} />
            <span>
              {draft.mode === "now"
                ? "Liquidity locked at launch."
                : "Deploy now, lock liquidity at launch."}
              <br />
              No {draft.base.symbol} deposit needed.
            </span>
          </div>
        </aside>
      </div>
      <div className="feature-strip">
        <div>
          <LockKeyhole size={22} />
          <span>
            <strong>Locked from the start</strong>
            <small>Initial liquidity stays in the pool.</small>
          </span>
        </div>
        <div>
          <Coins size={22} />
          <span>
            <strong>Your token is the deposit</strong>
            <small>No base-token capital required.</small>
          </span>
        </div>
        <div>
          <Info size={22} />
          <span>
            <strong>Clear rules, onchain</strong>
            <small>Shared Uniswap v4 tax hook.</small>
          </span>
        </div>
      </div>
    </>
  );
}
