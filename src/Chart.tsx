import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { Address, Hex } from "viem";
import { NETWORK } from "./networks";
import { Busy, Notice } from "./ui";

// CoinGecko's on-chain market data (GeckoTerminal) is public and keyless.
const API = "https://api.geckoterminal.com/api/v2";
const RANGES = {
  "24H": { timeframe: "minute", aggregate: 15, limit: 96 },
  "7D": { timeframe: "hour", aggregate: 1, limit: 168 },
  "30D": { timeframe: "hour", aggregate: 4, limit: 180 },
  "90D": { timeframe: "day", aggregate: 1, limit: 90 },
} as const;
type Range = keyof typeof RANGES;
type Point = { t: number; price: number };
export type MarketSummary = {
  priceUsd?: number;
  change24h?: number;
  volume24h?: number;
  liquidity?: number;
};

export const chartPage = (pool: Hex) =>
  `https://www.geckoterminal.com/${NETWORK.chartNetwork}/pools/${pool}`;

async function getJson(url: string) {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (res.status === 429)
    throw new Error("CoinGecko is rate-limiting requests. Try again in a minute.");
  if (!res.ok) throw new Error("CoinGecko market data is unavailable right now.");
  return res.json();
}

export function usePoolSummary(pool: Hex | undefined, token: Address) {
  return useQuery({
    queryKey: ["cg-pool", NETWORK.chartNetwork, pool, token],
    enabled: !!pool,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async (): Promise<MarketSummary | null> => {
      const data = await getJson(
        `${API}/networks/${NETWORK.chartNetwork}/pools/${pool}`,
      );
      const a = data?.data?.attributes;
      if (!a) return null;
      const num = (v: unknown) =>
        v === null || v === undefined || v === "" ? undefined : Number(v);
      // The pool's 24h change describes GeckoTerminal's base token only.
      const isBase = String(data.data.relationships?.base_token?.data?.id || "")
        .toLowerCase()
        .endsWith(token.toLowerCase());
      return {
        priceUsd: num(isBase ? a.base_token_price_usd : a.quote_token_price_usd),
        change24h: isBase ? num(a.price_change_percentage?.h24) : undefined,
        volume24h: num(a.volume_usd?.h24),
        liquidity: num(a.reserve_in_usd),
      };
    },
  });
}

export const usd = (n: number) =>
  n >= 1
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 1000 ? 0 : 2,
      })
    : `$${n.toPrecision(3)}`;
const compactUsd = (n: number) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });

export function PriceChart({
  pool,
  token,
  symbol,
}: {
  pool?: Hex;
  token: Address;
  symbol: string;
}) {
  const [range, setRange] = useState<Range>("7D");
  const summary = usePoolSummary(pool, token);
  const series = useQuery({
    queryKey: ["cg-ohlcv", NETWORK.chartNetwork, pool, token, range],
    enabled: !!pool,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<Point[]> => {
      const r = RANGES[range];
      const data = await getJson(
        `${API}/networks/${NETWORK.chartNetwork}/pools/${pool}/ohlcv/${r.timeframe}?aggregate=${r.aggregate}&limit=${r.limit}&currency=usd&token=${token}`,
      );
      const list = (data?.data?.attributes?.ohlcv_list || []) as number[][];
      const points = list
        .map(([t, , , , close]) => ({ t: t * 1000, price: Number(close) }))
        .filter((p) => Number.isFinite(p.price) && p.price > 0)
        .sort((a, b) => a.t - b.t);
      // CoinGecko only returns candles with trades; carry the last close to now.
      const last = points[points.length - 1];
      if (last && Date.now() - last.t > 60_000)
        points.push({ t: Date.now(), price: last.price });
      return points;
    },
  });
  const s = summary.data;
  return (
    <section className="chart-panel" aria-labelledby="chart-title">
      <div className="chart-head">
        <div>
          <h2 id="chart-title">{symbol} price</h2>
          <p className="chart-price">
            <strong>{s?.priceUsd ? usd(s.priceUsd) : "—"}</strong>
            {s?.priceUsd !== undefined && s.change24h !== undefined && (
              <span className={s.change24h >= 0 ? "change up" : "change down"}>
                {s.change24h >= 0 ? "▲" : "▼"} {Math.abs(s.change24h).toFixed(2)}%
                <span className="sr-only"> in 24 hours</span>
              </span>
            )}
          </p>
        </div>
        <div className="range-tabs" role="group" aria-label="Chart range">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              className={range === r ? "active" : ""}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {!pool ? (
        <div className="chart-empty">
          <p>The chart appears after the owner launches the market.</p>
        </div>
      ) : series.isPending ? (
        <div className="chart-empty">
          <Busy text="Loading CoinGecko chart…" />
        </div>
      ) : series.isError ? (
        <div className="chart-empty">
          <Notice error>
            {(series.error as Error).message}{" "}
            <button className="inline-button" onClick={() => series.refetch()}>
              Retry
            </button>
          </Notice>
        </div>
      ) : series.data.length < 2 ? (
        <div className="chart-empty">
          <p>
            CoinGecko has no trades for this pool in the selected range yet.
            Quotes in the swap panel come directly from the pool.
          </p>
        </div>
      ) : (
        <LineChart points={series.data} range={range} symbol={symbol} />
      )}
      <div className="chart-foot">
        <dl>
          <div>
            <dt>24h volume</dt>
            <dd>{s?.volume24h !== undefined ? compactUsd(s.volume24h) : "—"}</dd>
          </div>
          <div>
            <dt>Liquidity</dt>
            <dd>{s?.liquidity !== undefined ? compactUsd(s.liquidity) : "—"}</dd>
          </div>
        </dl>
        {pool && (
          <span className="chart-source">
            Data: CoinGecko
            {series.isFetching && <RefreshCw size={12} className="spinning" aria-hidden="true" />}
            <a className="text-link" href={chartPage(pool)} target="_blank" rel="noreferrer">
              Open full chart
              <ArrowUpRight size={14} />
            </a>
          </span>
        )}
      </div>
    </section>
  );
}

const W = 640;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

function LineChart({
  points,
  range,
  symbol,
}: {
  points: Point[];
  range: Range;
  symbol: string;
}) {
  const [active, setActive] = useState<number>();
  const gradient = useId();
  const geometry = useMemo(() => {
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || max * 0.05 || 1;
    const t0 = points[0].t;
    const tSpan = points[points.length - 1].t - t0 || 1;
    const x = (t: number) => PAD.left + ((t - t0) / tSpan) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - (min - span * 0.08)) / (span * 1.16)) * (H - PAD.top - PAD.bottom);
    const xy = points.map((p) => [x(p.t), y(p.price)] as const);
    const line = xy.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
    const area = `${line}L${xy[xy.length - 1][0].toFixed(1)},${H - PAD.bottom}L${xy[0][0].toFixed(1)},${H - PAD.bottom}Z`;
    return { min, max, xy, line, area };
  }, [points]);
  const first = points[0];
  const last = points[points.length - 1];
  const shown = active !== undefined ? points[active] : last;
  const label = (t: number) =>
    new Date(t).toLocaleString(
      [],
      range === "24H"
        ? { hour: "2-digit", minute: "2-digit" }
        : range === "7D"
          ? { weekday: "short", hour: "2-digit" }
          : { month: "short", day: "numeric" },
    );
  function move(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    let best = 0;
    geometry.xy.forEach(([x], i) => {
      if (Math.abs(x - px) < Math.abs(geometry.xy[best][0] - px)) best = i;
    });
    setActive(best);
  }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    const i = active ?? points.length - 1;
    const next =
      event.key === "ArrowLeft" ? i - 1
      : event.key === "ArrowRight" ? i + 1
      : event.key === "Home" ? 0
      : event.key === "End" ? points.length - 1
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(points.length - 1, next)));
  }
  const change = ((last.price - first.price) / first.price) * 100;
  const point = active !== undefined ? geometry.xy[active] : undefined;
  return (
    <figure className="chart-figure">
      <p className="chart-readout" aria-live="polite">
        <strong>{usd(shown.price)}</strong>{" "}
        <span>{new Date(shown.t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        tabIndex={0}
        aria-label={`${symbol} price over ${range}: from ${usd(first.price)} to ${usd(last.price)}, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}%. Low ${usd(geometry.min)}, high ${usd(geometry.max)}. Use arrow keys to inspect points.`}
        onPointerMove={move}
        onPointerLeave={() => setActive(undefined)}
        onKeyDown={key}
        onBlur={() => setActive(undefined)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="chart-axis" />
        <path d={geometry.area} fill={`url(#${gradient})`} />
        <path d={geometry.line} className="chart-line" />
        {point && (
          <>
            <line x1={point[0]} x2={point[0]} y1={PAD.top} y2={H - PAD.bottom} className="chart-crosshair" />
            <circle cx={point[0]} cy={point[1]} r={5} className="chart-dot" />
          </>
        )}
        <text x={PAD.left} y={H - 6} className="chart-label">{label(first.t)}</text>
        <text x={W - PAD.right} y={H - 6} className="chart-label" textAnchor="end">{label(last.t)}</text>
      </svg>
      <figcaption className="chart-range-note">
        Low {usd(geometry.min)} · High {usd(geometry.max)}
      </figcaption>
    </figure>
  );
}
