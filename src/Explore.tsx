import { useState } from "react";
import {
  useInfiniteQuery,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import { useConnection } from "wagmi";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Plus,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { BASES } from "./contracts";
import { activeChain, NETWORK } from "./networks";
import {
  discoverTokens,
  explorer,
  isTokenAddress,
  readToken,
  shortAddress,
  type TokenInfo,
} from "./chain";
import { displayAmount, errorMessage } from "./model";
import { Busy, Field, Notice } from "./ui";
import { useOpenWallet } from "./wallet";
export function TokenCard({ token }: { token: TokenInfo }) {
  const base = BASES.find((b) => b.address === token.quoteToken.toLowerCase());
  return (
    <article className="token-card">
      <div className="token-card-top">
        <span className="coin-icon">
          <Coins size={24} />
        </span>
        <div>
          <h2>
            <a href={`#/token/${token.address}`}>{token.name}</a>
          </h2>
          <span className="token-symbol">
            {token.symbol} / {base?.symbol || "Custom base"}
          </span>
        </div>
        <a
          href={explorer(token.address)}
          target="_blank"
          rel="noreferrer"
          className="icon-button"
          aria-label={`View ${token.name} on ${activeChain.blockExplorers.default.name}`}
        >
          <ArrowUpRight size={18} />
        </a>
      </div>
      <span className={`status-badge ${token.launched ? "live" : "waiting"}`}>
        {token.launched ? <CheckCircle2 size={13} /> : <Coins size={13} />}{" "}
        {token.launched ? "Launched" : "Awaiting launch"}
      </span>
      <dl className="token-metrics">
        <div>
          <dt>Buy / sell tax</dt>
          <dd>
            {token.taxBps / 100}%
            {token.taxDecayActive && <small>Decaying</small>}
          </dd>
        </div>
        <div>
          <dt>Total supply</dt>
          <dd>{displayAmount(token.totalSupply)}</dd>
        </div>
      </dl>
      <div className="token-card-bottom">
        <a
          className="muted address-small"
          href={explorer(token.address)}
          title={token.address}
          target="_blank"
          rel="noreferrer"
        >
          {shortAddress(token.address)}
        </a>
        <a className="text-link" href={`#/token/${token.address}`}>
          View token
          <ArrowRight size={16} />
        </a>
      </div>
    </article>
  );
}
export function Explore({ mine = false }: { mine?: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [base, setBase] = useState("all");
  const [direct, setDirect] = useState("");
  const [directError, setDirectError] = useState("");
  const { address, isConnected } = useConnection();
  const openWallet = useOpenWallet();
  const queryClient = useQueryClient();
  const index = useInfiniteQuery({
    queryKey: ["factory-tokens"],
    queryFn: ({ pageParam }) => discoverTokens(pageParam),
    initialPageParam: null as Record<string, string | number> | null,
    getNextPageParam: (last) => last.next ?? undefined,
    staleTime: 30000,
    retry: 1,
  });
  const addresses = [
    ...new Set(index.data?.pages.flatMap((p) => p.addresses) || []),
  ];
  const reads = useQueries({
    queries: addresses.map((address) => ({
      queryKey: ["token", address],
      queryFn: () => readToken(address),
      staleTime: 12000,
      refetchInterval: 30000,
      retry: 1,
    })),
  });
  const loading = reads.some((r) => r.isPending);
  const failed = reads.filter((r) => r.isError).length;
  const all = reads.flatMap((r) => (r.data ? [r.data] : []));
  const owned = mine
    ? all.filter(
        (t) => address && t.owner.toLowerCase() === address.toLowerCase(),
      )
    : all;
  const filtered = owned.filter(
    (t) =>
      `${t.name} ${t.symbol} ${t.address}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === "all" || t.launched === (status === "launched")) &&
      (base === "all" || t.quoteToken.toLowerCase() === base),
  );
  function openAddress(event: React.FormEvent) {
    event.preventDefault();
    const value = direct.trim();
    if (!isTokenAddress(value)) {
      setDirectError(`Enter a valid ${NETWORK.label} token address.`);
      document.getElementById("token-address")?.focus();
      return;
    }
    location.hash = `/token/${value}`;
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {mine ? "Your tokens, your controls." : "Discover new markets."}
          </h1>
          <p>
            {mine
              ? "Manage launches, fee recipients, and permissions."
              : "Explore tokens created with the shared ERC20T hook."}
          </p>
        </div>
        <a className="button primary" href="#/create">
          <Plus size={18} />
          Create a token
        </a>
      </div>
      <section className="lookup-bar" aria-label="Open a token">
        <form onSubmit={openAddress} noValidate>
          <Field
            id="token-address"
            label="Open a token by address"
            error={directError}
          >
            <input
              id="token-address"
              placeholder={`${NETWORK.label} token address (0x…)`}
              value={direct}
              onChange={(e) => {
                setDirect(e.target.value);
                setDirectError("");
              }}
              aria-invalid={!!directError}
              aria-describedby={directError ? "token-address-hint" : undefined}
            />
          </Field>
          <button className="button secondary" type="submit">
            Open token
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
      {mine && !isConnected ? (
        <div className="empty-state">
          <Wallet size={36} />
          <h2>Find the tokens you own</h2>
          <p>
            Connect your wallet to see owner controls. You can inspect any token
            using its address above.
          </p>
          <button className="button primary" onClick={openWallet}>
            Choose a wallet
            <ArrowRight size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="discovery-heading">
            <h2>
              {mine ? "Owned by this wallet" : "Latest indexed deployments"}
            </h2>
            <button
              className="button quiet"
              onClick={() => {
                index.refetch();
                queryClient.invalidateQueries({ queryKey: ["token"] });
              }}
              disabled={index.isFetching}
            >
              <RefreshCw
                size={16}
                className={index.isFetching ? "spinning" : ""}
              />
              Refresh
            </button>
          </div>
          <div className="discovery-controls">
            <div className="search-field">
              <Search size={18} aria-hidden="true" />
              <label className="sr-only" htmlFor="token-search">
                Search tokens by name, symbol, or address
              </label>
              <input
                id="token-search"
                type="search"
                placeholder="Search name, symbol, address"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="filter-select">
              <span className="sr-only">Filter by base</span>
              <select value={base} onChange={(e) => setBase(e.target.value)}>
                <option value="all">All bases</option>
                {BASES.map((b) => (
                  <option key={b.symbol} value={b.address}>
                    {b.symbol} pairs
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-tabs" aria-label="Filter by launch status">
            {[
              ["all", "All tokens"],
              ["launched", "Launched"],
              ["pending", "Awaiting launch"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                className={status === value ? "active" : ""}
                onClick={() => setStatus(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {index.isPending ? (
            <div className="loading-state">
              <Busy text="Reading factory deployments…" />
            </div>
          ) : index.error ? (
            <Notice error>
              {errorMessage(index.error)}{" "}
              <button className="inline-button" onClick={() => index.refetch()}>
                Retry discovery
              </button>
            </Notice>
          ) : (
            <>
              {failed > 0 && (
                <Notice error>
                  {failed} token {failed === 1 ? "read is" : "reads are"}{" "}
                  unavailable.{" "}
                  <button
                    className="inline-button"
                    onClick={() =>
                      queryClient.invalidateQueries({ queryKey: ["token"] })
                    }
                  >
                    Retry reads
                  </button>
                </Notice>
              )}
              {loading && (
                <Busy text={`Reading token details from ${NETWORK.label}…`} />
              )}
              {filtered.length > 0 ? (
                <div className="token-grid">
                  {filtered.map((t) => (
                    <TokenCard key={t.address} token={t} />
                  ))}
                </div>
              ) : (
                !loading && (
                  <div className="empty-state">
                    <Search size={32} />
                    <h2>
                      {search
                        ? "No matching tokens"
                        : mine
                          ? "No owned tokens in this page"
                          : "No tokens in this view"}
                    </h2>
                    <p>
                      {mine
                        ? "Load older deployments or open a token by its address."
                        : search
                          ? `No loaded token matches “${search}”. Try a different search or clear the filters.`
                          : "Try another launch status or base token."}
                    </p>
                    {(search || status !== "all" || base !== "all") && (
                      <button
                        className="button secondary"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setBase("all");
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )
              )}
              <div className="discovery-footer">
                <p className="field-hint">
                  {filtered.length} of {all.length} loaded tokens · Indexed by
                  Blockscout, verified against {NETWORK.label}.
                  <br />
                  Tax reads refresh every 30 seconds. Open a token for its
                  latest block.
                </p>
                {index.hasNextPage && (
                  <button
                    className="button secondary"
                    onClick={() => index.fetchNextPage()}
                    disabled={index.isFetchingNextPage}
                  >
                    {index.isFetchingNextPage
                      ? "Loading…"
                      : "Load older deployments"}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
