import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { networkKey, type BaseToken } from "./networks";
import { errorMessage } from "./model";
import {
  assertFreshQuote,
  fetchUsdQuote,
  MARKET_CAPS,
  marketCapPrice,
  type PriceSettings,
  type UsdQuote,
} from "./pricing";
import { Busy, Field, Notice } from "./ui";
export const dollars = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
export function useStartingPrice(
  supply: bigint,
  base: BaseToken,
  settings: PriceSettings,
  enabled = true,
  live = true,
) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const quote = useQuery({
    queryKey: ["usd-price", networkKey, base.address],
    queryFn: ({ signal }) => fetchUsdQuote(base, networkKey, signal),
    enabled: enabled && settings.mode === "marketcap",
    staleTime: 60_000,
    refetchInterval:
      enabled && live && settings.mode === "marketcap" ? 60_000 : false,
    retry: 1,
  });
  let price = settings.manualPrice;
  let problem = "";
  if (settings.mode === "marketcap") {
    price = "";
    if (quote.error) problem = errorMessage(quote.error);
    else if (quote.data) {
      try {
        assertFreshQuote(quote.data, Math.max(now, Date.now()));
        price = formatUnits(
          marketCapPrice(
            settings.marketCap,
            supply,
            quote.data.usd,
            base.decimals,
          ),
          base.decimals,
        );
      } catch (e) {
        problem = errorMessage(e);
      }
    }
  }
  return { quote, price, problem };
}
export function StartingPrice({
  id = "starting",
  base,
  settings,
  onChange,
  price,
  quote,
  problem,
  pending,
  fetching,
  refresh,
  error,
  disabled = false,
}: {
  id?: string;
  base: BaseToken;
  settings: PriceSettings;
  onChange: (value: PriceSettings) => void;
  price: string;
  quote?: UsdQuote;
  problem: string;
  pending: boolean;
  fetching: boolean;
  refresh: () => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="starting-price">
      <fieldset disabled={disabled} aria-describedby={`${id}-help`}>
        <legend>Starting market cap</legend>
        <p className="field-hint" id={`${id}-help`}>
          Choose a target. We calculate the starting price in {base.symbol}.
        </p>
        <div className="marketcap-options">
          {MARKET_CAPS.map((cap) => (
            <label
              key={cap}
              className={`marketcap-option ${settings.mode === "marketcap" && settings.marketCap === cap ? "selected" : ""}`}
            >
              <input
                type="radio"
                name={`${id}-cap`}
                checked={
                  settings.mode === "marketcap" && settings.marketCap === cap
                }
                onChange={() =>
                  onChange({ ...settings, mode: "marketcap", marketCap: cap })
                }
              />
              <span>~${cap === 1_000_000 ? "1m" : `${cap / 1000}k`}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field-hint">
        Based on total supply, including your allocation. This is an indicative
        valuation, not funds raised.
      </p>
      <button
        type="button"
        className="inline-button price-mode"
        disabled={disabled}
        aria-expanded={settings.mode === "manual"}
        onClick={() =>
          onChange({
            ...settings,
            mode: settings.mode === "manual" ? "marketcap" : "manual",
          })
        }
      >
        {settings.mode === "manual"
          ? "Use market-cap options"
          : "Enter a manual price"}
      </button>
      {settings.mode === "manual" ? (
        <Field
          id={`${id}-price`}
          label={`Starting price (${base.symbol} per token)`}
          error={error}
          hint="Enter base units per whole token. The factory aligns the price to a pool tick."
        >
          <input
            id={`${id}-price`}
            inputMode="decimal"
            autoComplete="off"
            value={settings.manualPrice}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...settings, manualPrice: e.target.value })
            }
            aria-invalid={!!error}
            aria-describedby={`${id}-price-hint`}
          />
        </Field>
      ) : (
        <div className="quote-details">
          <div className="row-between">
            <strong>Calculated starting price</strong>
            <button
              type="button"
              className="button quiet quote-refresh"
              onClick={refresh}
              disabled={fetching || disabled}
              aria-label="Refresh prices"
            >
              <RefreshCw size={15} className={fetching ? "spinning" : ""} />
              Refresh
            </button>
          </div>
          {pending ? (
            <Busy text={`Fetching ${base.symbol} price…`} />
          ) : problem ? (
            <Notice error>{problem}</Notice>
          ) : price && quote ? (
            <>
              <p className="price-value" aria-live="polite">
                {price} {base.symbol} per token
              </p>
              <p className="field-hint">
                1 {base.symbol} = {dollars(Number(quote.usd))} ·{" "}
                <a href={quote.url} target="_blank" rel="noreferrer">
                  {quote.source}
                </a>{" "}
                · {quote.source === "CoinGecko" ? "Updated" : "Fetched"}{" "}
                {new Date(quote.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="field-hint">
                {quote.source === "DexScreener"
                  ? "Most liquid quoted pair on this network. "
                  : ""}
                Quotes refresh every minute here. The reviewed price stays
                fixed; pool ticks and later trading may change the valuation.
              </p>
            </>
          ) : null}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
