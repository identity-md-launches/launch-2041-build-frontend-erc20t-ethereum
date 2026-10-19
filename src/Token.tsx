import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { erc20Abi, formatUnits, isAddress, type Address } from "viem";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Coins,
  LockKeyhole,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { BASES, NATIVE_ETH, tokenAbi } from "./contracts";
import {
  eligibleBase,
  explorer,
  isTokenAddress,
  previewLaunch,
  readToken,
  verifyInfrastructure,
  type TokenInfo,
} from "./chain";
import { publicClient } from "./config";
import {
  displayAmount,
  displayNumber,
  duration,
  errorMessage,
  parseDecimal,
  validRecipient,
} from "./model";
import { AddressValue, Busy, Field, Modal, Notice, Stat } from "./ui";
import {
  TransactionStatus,
  useTransaction,
  type TxRequest,
} from "./transactions";
import { useOpenWallet } from "./wallet";
import { activeChain, NETWORK } from "./networks";
import { StartingPrice, useStartingPrice, dollars } from "./StartingPrice";
import { SwapPanel } from "./Swap";
import { PriceChart } from "./Chart";
import { poolId, readPools } from "./swap";
import {
  assertFreshQuote,
  initialPriceSettings,
  impliedMarketCap,
  type UsdQuote,
} from "./pricing";

export function TokenPage({ address }: { address: string }) {
  const valid = isTokenAddress(address);
  const query = useQuery({
    queryKey: ["token", address],
    queryFn: () => readToken(address as Address),
    enabled: valid,
    refetchInterval: 12000,
    retry: 1,
  });
  return (
    <>
      <a className="text-link back-link" href="#/explore">
        <ArrowLeft size={16} />
        Back to tokens
      </a>
      {!valid ? (
        <Notice error>
          This is not a valid token address. Open a token from Explore.
        </Notice>
      ) : query.isPending ? (
        <div className="loading-state">
          <Busy text={`Reading token state from ${NETWORK.label}…`} />
        </div>
      ) : query.data ? (
        <>
          <TokenDetails
            key={address}
            token={query.data}
            refresh={() => query.refetch()}
            fetching={query.isFetching}
            stale={query.isError}
          />
          {query.error && (
            <Notice error>
              Live refresh is unavailable. Values below are from block{" "}
              {query.data.block.toString()}.{" "}
              <button className="inline-button" onClick={() => query.refetch()}>
                Retry
              </button>
            </Notice>
          )}
        </>
      ) : (
        <div className="error-panel">
          <h1>Token could not be opened</h1>
          <Notice error>{errorMessage(query.error)}</Notice>
          <button className="button secondary" onClick={() => query.refetch()}>
            Retry token lookup
          </button>
          <a
            className="text-link"
            href={explorer(address)}
            target="_blank"
            rel="noreferrer"
          >
            Check address on {activeChain.blockExplorers.default.name}
            <ArrowUpRight size={16} />
          </a>
        </div>
      )}
    </>
  );
}
function TokenDetails({
  token,
  refresh,
  fetching,
  stale,
}: {
  token: TokenInfo;
  refresh: () => void;
  fetching: boolean;
  stale: boolean;
}) {
  const account = useConnection();
  const owner = account.address?.toLowerCase() === token.owner.toLowerCase();
  const knownBase = BASES.find(
    (b) => b.address === token.quoteToken.toLowerCase(),
  );
  const baseMetadata = useQuery({
    queryKey: ["base-metadata", token.quoteToken],
    queryFn: async () => {
      const result = await publicClient.multicall({
        contracts: [
          { address: token.quoteToken, abi: erc20Abi, functionName: "symbol" },
          {
            address: token.quoteToken,
            abi: erc20Abi,
            functionName: "decimals",
          },
        ],
        allowFailure: false,
      });
      return { symbol: result[0], decimals: result[1] };
    },
    enabled: !knownBase,
    staleTime: Infinity,
  });
  const base = knownBase || baseMetadata.data;
  const pools = useQuery({
    queryKey: ["pools", token.address, token.quoteToken, token.hook],
    queryFn: () => readPools(token.address, token.quoteToken, token.hook),
    enabled: token.launched,
    staleTime: Infinity,
    retry: 2,
  });
  const tokenAsset = { address: token.address, symbol: token.symbol, decimals: 18 };
  return (
    <>
      <div className="page-heading token-page-heading">
        <div className="token-page-name">
          <span className="coin-icon large">
            <Coins size={30} />
          </span>
          <div>
            <h1>{token.name}</h1>
            <p>
              {token.symbol} / {base?.symbol || "Custom base"}{" "}
              <span
                className={`status-badge ${token.launched ? "live" : "waiting"}`}
              >
                {token.launched ? "Launched" : "Awaiting launch"}
              </span>
            </p>
          </div>
        </div>
        <button
          className="button secondary"
          onClick={refresh}
          disabled={fetching}
        >
          <RefreshCw size={16} className={fetching ? "spinning" : ""} />
          Refresh state
        </button>
      </div>
      <div className="token-address-row">
        <AddressValue address={token.address} />
        <p className="chain-read">
          <span className={stale ? "status-dot stale" : "status-dot"} />
          {stale ? "Last read" : `Read from ${NETWORK.label}`} · Block{" "}
          {token.block.toString()}
          <br />
          <span>
            Updated{" "}
            {new Date(token.checkedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </p>
      </div>
      <div className="trade-grid">
        {base ? (
          <SwapPanel
            token={tokenAsset}
            base={{ address: token.quoteToken, symbol: base.symbol, decimals: base.decimals }}
            pools={pools.data}
            taxBps={token.taxBps}
          />
        ) : (
          <section className="swap-panel">
            <Busy text="Reading base token…" />
          </section>
        )}
        <PriceChart
          pool={pools.data ? poolId(pools.data.tokenPool) : undefined}
          token={token.address}
          symbol={token.symbol}
        />
      </div>
      {pools.isError && (
        <Notice error>
          The pool route could not be read. {errorMessage(pools.error)}{" "}
          <button className="inline-button" onClick={() => pools.refetch()}>
            Retry
          </button>
        </Notice>
      )}
      <div className="detail-grid">
        <div className="market-panel">
          <div className="panel-heading">
            <h2>Market overview</h2>
            <ShieldCheck size={20} />
          </div>
          <div className="large-tax">
            <span>
              {token.launched ? "Current buy / sell tax" : "Tax at launch"}
            </span>
            <strong>
              {token.taxBps / 100}
              <small>%</small>
            </strong>
            <span className="status-badge">
              {token.taxDecayActive ? (
                <>
                  <Clock3 size={14} />
                  Launch decay active
                </>
              ) : token.launchTaxBps && !token.launched ? (
                "Decay begins at launch"
              ) : (
                "Resting rate"
              )}
            </span>
          </div>
          <div className="market-stats">
            <Stat label="Total supply">{displayAmount(token.totalSupply)}</Stat>
            <Stat label="Resting tax">{token.restingTaxBps / 100}%</Stat>
            <Stat label="Swap type">Exact input only</Stat>
            <Stat label="Base deposit at launch">None</Stat>
          </div>
          <div className="fee-breakdown">
            <h3>Where the tax goes</h3>
            <dl>
              <div>
                <dt>Protocol</dt>
                <dd>0.15%</dd>
              </div>
              <div>
                <dt>Regular recipient</dt>
                <dd>{displayNumber((token.restingTaxBps - 15) / 100, 2)}%</dd>
              </div>
              <div>
                <dt>Decay recipient</dt>
                <dd>
                  {displayNumber(
                    Math.max(0, token.taxBps - token.restingTaxBps) / 100,
                    2,
                  )}
                  %
                </dd>
              </div>
            </dl>
            <p className="field-hint">
              All fees are converted to ETH. Percentages split the tax on swap
              output; conversion prices and other pool fees affect ETH received.
            </p>
            {token.launchTaxBps > 0 && (
              <p className="field-hint">
                Decay: 1 percentage point every{" "}
                {duration(token.taxDecayIntervalSeconds)}, starting at 99%.{" "}
                {token.launchedAt > 0n
                  ? `Launched ${new Date(Number(token.launchedAt) * 1000).toLocaleString()}.`
                  : "The decay clock has not started."}
              </p>
            )}
          </div>
          <div className="preview-note">
            <LockKeyhole size={19} />
            <span>
              {token.launched
                ? "Initial liquidity is permanently locked."
                : "Initial liquidity locks when the owner launches."}
              <br />
              Direct wallet transfers are untaxed.
            </span>
          </div>
          <details className="technical-details">
            <summary>Contract details</summary>
            <dl>
              <dt>Owner</dt>
              <dd>
                <AddressValue address={token.owner} />
              </dd>
              <dt>Regular recipient</dt>
              <dd>
                <AddressValue address={token.feeRecipient} />
              </dd>
              <dt>Decay recipient</dt>
              <dd>
                <AddressValue address={token.feeDecayRecipient} />
              </dd>
              <dt>Base currency</dt>
              <dd>
                {token.quoteToken.toLowerCase() === NATIVE_ETH ? (
                  "Native ETH"
                ) : (
                  <AddressValue address={token.quoteToken} />
                )}
              </dd>
              <dt>Shared hook</dt>
              <dd>
                <AddressValue address={token.hook} />
              </dd>
            </dl>
          </details>
        </div>
        <OwnerControls
          token={token}
          owner={owner}
          base={base}
          refresh={refresh}
        />
      </div>
    </>
  );
}
type Change = {
  title: string;
  quote?: UsdQuote;
  description: string;
  request: TxRequest;
  display: string;
};
function OwnerControls({
  token,
  owner,
  base,
  refresh,
}: {
  token: TokenInfo;
  owner: boolean;
  base?: { symbol: string; decimals: number };
  refresh: () => void;
}) {
  const account = useConnection();
  const openWallet = useOpenWallet();
  const tx = useTransaction();
  const client = useQueryClient();
  const [tab, setTab] = useState(token.launched ? "fees" : "launch");
  useEffect(() => {
    if (token.launched && tab === "launch") setTab("fees");
  }, [token.launched, tab]);
  const [fee, setFee] = useState(token.feeRecipient);
  const [decay, setDecay] = useState(token.feeDecayRecipient);
  const [tax, setTax] = useState(token.restingTaxBps / 100);
  const [distributors, setDistributors] = useState("");
  const [distError, setDistError] = useState("");
  const [recipientError, setRecipientError] = useState("");
  const [distCheck, setDistCheck] = useState("");
  const [distStatus, setDistStatus] = useState("");
  const [priceSettings, setPriceSettings] = useState(initialPriceSettings);
  const pricing = useStartingPrice(
    token.totalSupply,
    {
      address: token.quoteToken,
      symbol: base?.symbol || "base",
      name: base?.symbol || "Base",
      decimals: base?.decimals ?? 18,
    },
    priceSettings,
    !token.launched && !!base,
    tab === "launch",
  );
  const [priceError, setPriceError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [change, setChange] = useState<Change>();
  const writable = owner && account.chainId === activeChain.id && !tx.busy;
  function propose(
    title: string,
    description: string,
    functionName: string,
    args: unknown[],
    display: string,
  ) {
    tx.reset();
    setChange({
      title,
      description,
      display,
      request: { address: token.address, abi: tokenAbi, functionName, args },
    });
  }
  async function confirm() {
    if (!change || !writable) return;
    const receipt = await tx.run(
      change.request,
      async () => {
        if (change.quote) assertFreshQuote(change.quote);
        const latest = (await publicClient.readContract({
          address: token.address,
          abi: tokenAbi,
          functionName: "owner",
        })) as Address;
        if (latest.toLowerCase() !== account.address?.toLowerCase())
          throw new Error(
            "This wallet is no longer the token owner. Refresh the token state.",
          );
        if (change.request.functionName === "launch") {
          await verifyInfrastructure(token.hook);
          await eligibleBase(token.quoteToken, token.hook);
        }
      },
      () => {
        if (change.quote) assertFreshQuote(change.quote);
      },
    );
    if (receipt) {
      refresh();
      client.invalidateQueries({ queryKey: ["factory-tokens"] });
    }
  }
  function recipient(event: FormEvent, which: "regular" | "decay") {
    event.preventDefault();
    const value = which === "regular" ? fee : decay;
    if (
      !validRecipient(value) ||
      value.toLowerCase() === token.address.toLowerCase()
    ) {
      setRecipientError(
        "Use a valid recipient address other than this token or its infrastructure.",
      );
      return;
    }
    setRecipientError("");
    propose(
      which === "regular"
        ? "Update regular recipient"
        : "Update decay recipient",
      "Future ETH fees will be sent to this address. The other recipient stays independently configured.",
      which === "regular" ? "setFeeRecipient" : "setFeeDecayRecipient",
      [value],
      value,
    );
  }
  async function setDistributor(allowed: boolean) {
    const values = distributors.split(/[\s,]+/).filter(Boolean);
    if (
      !values.length ||
      values.some(
        (v) =>
          !validRecipient(v) || v.toLowerCase() === token.address.toLowerCase(),
      )
    ) {
      setDistError(
        "Enter valid contract addresses separated by commas or new lines.",
      );
      return;
    }
    setDistError("");
    propose(
      allowed ? "Approve distributors" : "Remove distributors",
      allowed
        ? "Approved contracts may transfer tokens to or from any wallet. Only approve contracts you trust."
        : "This removes local permissions. A contract may still be approved globally while global distributors are enabled.",
      "setDistributors",
      [[...new Set(values)], allowed],
      values.join("\n"),
    );
  }
  async function checkDistributor() {
    setDistStatus("");
    if (!isAddress(distCheck)) {
      setDistStatus("Enter a valid wallet or contract address.");
      return;
    }
    try {
      const [local, effective] = await publicClient.multicall({
        contracts: [
          {
            address: token.address,
            abi: tokenAbi,
            functionName: "isLocalDistributor",
            args: [distCheck],
          },
          {
            address: token.address,
            abi: tokenAbi,
            functionName: "isDistributor",
            args: [distCheck],
          },
        ],
        allowFailure: false,
      });
      setDistStatus(
        `Local approval: ${local ? "yes" : "no"}. Effective approval: ${effective ? "yes" : "no"}.`,
      );
    } catch (e) {
      setDistStatus(errorMessage(e));
    }
  }
  async function prepareLaunch(event: FormEvent) {
    event.preventDefault();
    if (!base) return;
    setPriceError("");
    setPreparing(true);
    try {
      if (priceSettings.mode === "marketcap") {
        if (pricing.problem || !pricing.quote.data)
          throw new Error(
            pricing.problem || "Wait for the base-token price, then try again.",
          );
        assertFreshQuote(pricing.quote.data);
      }
      const amount = parseDecimal(pricing.price, base.decimals);
      const p = await previewLaunch(
        token.reserve,
        0,
        amount,
        BigInt(token.address) < BigInt(token.quoteToken),
      );
      tx.reset();
      setChange({
        title: "Launch the token",
        quote:
          priceSettings.mode === "marketcap" ? pricing.quote.data : undefined,
        description: `This creates the canonical pool on ${NETWORK.label} and permanently locks the token reserve. No base-token deposit is sent. Gas in ETH is required.`,
        display: `Reserve: ${displayAmount(token.reserve)} ${token.symbol}\nEffective starting price: ${formatUnits(p.effectivePriceWei, base.decimals)} ${base.symbol} per token${priceSettings.mode === "marketcap" && pricing.quote.data ? `\nTarget market cap: ~${dollars(priceSettings.marketCap)}\nAfter tick alignment: ~${dollars(Number(impliedMarketCap(p.effectivePriceWei, token.totalSupply, pricing.quote.data.usd, base.decimals)))}\n${pricing.quote.data.source}: 1 ${base.symbol} = ${dollars(Number(pricing.quote.data.usd))} (quote must be under 5 minutes old when you sign)` : ""}`,
        request: {
          address: token.address,
          abi: tokenAbi,
          functionName: "launch",
          args: [p.sqrtPriceX96, p.tickLower, p.tickUpper],
          value: 0n,
        },
      });
    } catch (e) {
      setPriceError(errorMessage(e));
    } finally {
      setPreparing(false);
    }
  }
  return (
    <section className="owner-panel">
      <div className="panel-heading">
        <h2>Owner controls</h2>
        <Settings2 size={20} />
      </div>
      {!account.isConnected ? (
        <Notice>
          Connect your owner wallet to change settings.{" "}
          <button className="inline-button" onClick={openWallet}>
            Choose wallet
          </button>
        </Notice>
      ) : !owner ? (
        <Notice>
          This wallet is not the token owner. Settings are read-only.
        </Notice>
      ) : account.chainId !== activeChain.id ? (
        <Notice error>
          Switch your wallet to {NETWORK.label} before making changes.
        </Notice>
      ) : (
        <p className="inline-success">
          <CheckCircle2 size={15} />
          Connected as the token owner
        </p>
      )}
      <div className="owner-tabs" aria-label="Owner settings">
        {[
          ...(!token.launched ? [["launch", "Launch"]] : []),
          ["fees", "Fees"],
          ["permissions", "Permissions"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={tab === id ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "launch" && !token.launched && (
        <form onSubmit={prepareLaunch} noValidate className="owner-form">
          <h3>Open your market</h3>
          <p className="muted">
            The base currency is fixed. Choose a starting market cap for the
            full token supply.
          </p>
          <Stat label="Token reserve">
            {displayAmount(token.reserve)} {token.symbol}
          </Stat>
          <StartingPrice
            id="launch"
            base={{
              address: token.quoteToken,
              symbol: base?.symbol || "base",
              name: base?.symbol || "Base",
              decimals: base?.decimals ?? 18,
            }}
            settings={priceSettings}
            onChange={(settings) => {
              setPriceSettings(settings);
              setPriceError("");
            }}
            price={pricing.price}
            quote={pricing.quote.data}
            pending={pricing.quote.isPending}
            fetching={pricing.quote.isFetching}
            problem={pricing.problem}
            refresh={() => pricing.quote.refetch()}
            error={priceError}
            disabled={!writable || preparing}
          />
          <Notice>
            Launching is irreversible. The initial liquidity position cannot be
            withdrawn.
          </Notice>
          <button
            className="button primary full"
            disabled={!writable || preparing || !base}
          >
            {preparing ? "Reading launch preview…" : "Preview & launch"}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
      {tab === "fees" && (
        <div className="owner-form">
          <form onSubmit={(e) => recipient(e, "regular")} noValidate>
            <Field
              id="regular-recipient"
              label="Regular fee recipient"
              hint="Receives the resting tax minus the included 0.15% protocol component."
            >
              <input
                id="regular-recipient"
                value={fee}
                onChange={(e) => setFee(e.target.value.trim() as Address)}
                disabled={!writable}
              />
            </Field>
            <button className="button secondary" disabled={!writable}>
              Review recipient change
              <ArrowRight size={16} />
            </button>
          </form>
          <form onSubmit={(e) => recipient(e, "decay")} noValidate>
            <Field
              id="decay-recipient"
              label="Decay fee recipient"
              hint="Receives tax above the resting rate during launch decay."
            >
              <input
                id="decay-recipient"
                value={decay}
                onChange={(e) => setDecay(e.target.value.trim() as Address)}
                disabled={!writable}
              />
            </Field>
            <button className="button secondary" disabled={!writable}>
              Review decay recipient
              <ArrowRight size={16} />
            </button>
          </form>
          {recipientError && <Notice error>{recipientError}</Notice>}
          <div className="range-field">
            <div className="row-between">
              <label htmlFor="owner-tax">Resting tax</label>
              <output htmlFor="owner-tax">{tax}%</output>
            </div>
            <input
              id="owner-tax"
              type="range"
              min="0.3"
              max="5"
              step="0.1"
              value={tax}
              onChange={(e) => setTax(+e.target.value)}
              disabled={!writable || token.taxDecayActive}
            />
            {token.taxDecayActive && (
              <p className="field-hint">
                Tax changes are locked until launch decay finishes.
              </p>
            )}
            <button
              className="button secondary"
              disabled={!writable || token.taxDecayActive}
              onClick={() =>
                propose(
                  "Update resting tax",
                  "This changes future buy and sell tax. It does not restart a completed decay schedule.",
                  "setTaxBps",
                  [Math.round(tax * 100)],
                  `${tax}% buy / sell tax`,
                )
              }
            >
              Review tax change
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      {tab === "permissions" && (
        <div className="owner-form">
          <Permission
            label="Global distributors"
            description="Use the shared hook owner’s approved distribution contracts."
            current={token.useGlobalDistributors}
            disabled={!writable}
            onChange={() =>
              propose(
                token.useGlobalDistributors
                  ? "Disable global distributors"
                  : "Enable global distributors",
                "This changes whether shared approvals are used. Local distributor approvals are independent.",
                "setUseGlobalDistributors",
                [!token.useGlobalDistributors],
                token.useGlobalDistributors
                  ? "Global approvals disabled"
                  : "Global approvals enabled",
              )
            }
          />
          <Permission
            label="External liquidity"
            description="Allow anyone to add liquidity to the canonical pool. The original launch position remains locked."
            current={token.externalLiquidityEnabled}
            disabled={!writable}
            onChange={() =>
              propose(
                token.externalLiquidityEnabled
                  ? "Disable external liquidity"
                  : "Enable external liquidity",
                "This controls new external liquidity deposits. It does not unlock the original position.",
                "setExternalLiquidityEnabled",
                [!token.externalLiquidityEnabled],
                token.externalLiquidityEnabled
                  ? "New external deposits disabled"
                  : "New external deposits enabled",
              )
            }
          />
          <Permission
            label="Pairing permission"
            description={
              token.quoteToken.toLowerCase() === NATIVE_ETH
                ? "Allow this token to be the base for new ERC20T markets. Existing pairs remain usable when disabled."
                : "Only ETH-paired tokens can enable pairing permission."
            }
            current={token.pairingEnabled}
            disabled={
              !writable || token.quoteToken.toLowerCase() !== NATIVE_ETH
            }
            onChange={() =>
              propose(
                token.pairingEnabled ? "Disable new pairs" : "Enable new pairs",
                "This affects new markets using this token as their base. Existing pairs continue operating.",
                "setPairingEnabled",
                [!token.pairingEnabled],
                token.pairingEnabled
                  ? "New pairing disabled"
                  : "New pairing enabled",
              )
            }
          />
          <div className="distributor-editor">
            <h3>Local distributors</h3>
            <p className="field-hint">
              Approve trusted contracts to transfer to or from wallets.
            </p>
            <Field
              id="distributors"
              label="Contract addresses"
              error={distError}
            >
              <textarea
                id="distributors"
                rows={3}
                placeholder="One address per line"
                value={distributors}
                onChange={(e) => setDistributors(e.target.value)}
                disabled={!writable}
                aria-invalid={!!distError}
                aria-describedby={distError ? "distributors-hint" : undefined}
              />
            </Field>
            <div className="button-row">
              <button
                className="button secondary"
                disabled={!writable}
                onClick={() => setDistributor(true)}
              >
                Review approval
              </button>
              <button
                className="button secondary"
                disabled={!writable}
                onClick={() => setDistributor(false)}
              >
                Review removal
              </button>
            </div>
          </div>
          <div className="distributor-check">
            <Field id="distributor-check" label="Check a distributor’s access">
              <input
                id="distributor-check"
                placeholder="Contract address (0x…)"
                value={distCheck}
                onChange={(e) => setDistCheck(e.target.value)}
              />
            </Field>
            <button className="button secondary" onClick={checkDistributor}>
              Check permissions
            </button>
            {distStatus && (
              <p className="field-hint" role="status">
                {distStatus}
              </p>
            )}
          </div>
        </div>
      )}
      <Modal
        dismissible={!tx.busy}
        open={!!change}
        onClose={() => {
          if (!tx.busy) setChange(undefined);
        }}
        title={change?.title || "Review change"}
      >
        <p className="muted">{change?.description}</p>
        <p className="confirmation-value">{change?.display}</p>
        <p className="field-hint">{activeChain.name} · Contract</p>
        <AddressValue address={token.address} />
        <TransactionStatus
          state={tx.state}
          reset={tx.reset}
          checkReceipt={async () => {
            await tx.checkReceipt();
            refresh();
          }}
        />
        {tx.state.phase === "success" ? (
          <button
            className="button primary full"
            onClick={() => setChange(undefined)}
          >
            Done
            <CheckCircle2 size={18} />
          </button>
        ) : (
          <button
            className="button primary full"
            onClick={confirm}
            disabled={!writable || !!tx.state.hash}
          >
            {tx.busy ? "Transaction in progress…" : "Confirm in wallet"}
            <ArrowRight size={18} />
          </button>
        )}
        <p className="field-hint">
          The transaction is simulated before your wallet asks you to sign.
        </p>
      </Modal>
    </section>
  );
}
function Permission({
  label,
  description,
  current,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  current: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className="permission">
      <div className="row-between">
        <h3>{label}</h3>
        <span className="status-badge">{current ? "Enabled" : "Disabled"}</span>
      </div>
      <p>{description}</p>
      <button
        className="button secondary"
        disabled={disabled}
        onClick={onChange}
      >
        Review {current ? "disable" : "enable"}
      </button>
    </div>
  );
}
