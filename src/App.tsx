import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { CONTRACTS } from "./contracts";
import { Create } from "./Create";
import { Explore } from "./Explore";
import { TokenPage } from "./Token";
import { ConnectControl } from "./wallet";
import { AddressValue, Mark } from "./ui";
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/create");
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || "/create");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return route;
}
export default function App() {
  const route = useRoute();
  const page = route.startsWith("/token/") ? "token" : route.slice(1);
  const [visitedCreate, setVisitedCreate] = useState(page === "create");
  useEffect(() => {
    if (page === "create") setVisitedCreate(true);
    document.title =
      page === "create"
        ? "ERC20T · Create an Ethereum token"
        : page === "explore"
          ? "Explore tokens · ERC20T"
          : page === "manage"
            ? "Manage tokens · ERC20T"
            : page === "token"
              ? "Token & owner controls · ERC20T"
              : "How ERC20T works";
  }, [page]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a href="#/create" className="brand" aria-label="ERC20T home">
            <Mark />
            <span>
              ERC20<span className="brand-t">T</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <a
              href="#/create"
              aria-current={page === "create" ? "page" : undefined}
            >
              Create<span className="nav-desktop"> a token</span>
            </a>
            <a
              href="#/explore"
              aria-current={
                page === "explore" || page === "token" ? "page" : undefined
              }
            >
              Explore
            </a>
            <a
              href="#/manage"
              aria-current={page === "manage" ? "page" : undefined}
            >
              Manage
            </a>
          </nav>
          <div className="header-utilities">
            <span className="network-label">
              <svg viewBox="0 0 20 28" aria-hidden="true">
                <path
                  d="m10 0 9 15-9 5-9-5ZM1 17l9 11 9-11-9 5Z"
                  fill="currentColor"
                />
              </svg>
              Ethereum
              <span className="network-dot" />
            </span>
            <ConnectControl />
          </div>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {visitedCreate && (
          <div hidden={page !== "create"}>
            <Create />
          </div>
        )}
        {page === "explore" && <Explore />}
        {page === "manage" && <Explore mine />}
        {page === "token" && (
          <TokenPage address={route.split("/")[2] || ""} />
        )}{" "}
        {page === "how-it-works" && <Guide />}
        {!["create", "explore", "manage", "token", "how-it-works"].includes(
          page,
        ) && (
          <div className="empty-state">
            <h1>Page not found</h1>
            <a href="#/create" className="button primary">
              Create a token
              <ArrowRight size={18} />
            </a>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <Mark small />
          <span>ERC20T</span>
          <span className="footer-divider">/</span>
          <span>Built on Ethereum. Powered by Uniswap v4.</span>
        </div>
        <div>
          <a href="#/how-it-works">How it works</a>
          <a
            href={`https://etherscan.io/address/${CONTRACTS.hook}#code`}
            target="_blank"
            rel="noreferrer"
          >
            Verified contracts
            <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
    </>
  );
}
function Guide() {
  return (
    <article className="guide">
      <div className="page-heading">
        <div>
          <h1>A market from your supply.</h1>
          <p>How ERC20T launches, taxes, and permissions work.</p>
        </div>
        <a className="button primary" href="#/create">
          Create a token
          <ArrowRight size={18} />
        </a>
      </div>
      <div className="guide-intro">
        <LockKeyhole size={36} />
        <p>
          Keep up to 20% of your token. The rest seeds a permanently locked,
          token-only position on Uniswap v4. You don’t need to deposit ETH or
          another base token to launch.
        </p>
      </div>
      <div className="guide-grid">
        <section>
          <h2>Two ways to launch</h2>
          <p>
            <strong>Deploy & launch</strong> creates your token and its pool in
            a single Ethereum transaction. You set the starting price in base
            units per whole token. The factory aligns it to an eligible tick and
            resolves address ordering.
          </p>
          <p>
            <strong>Deploy first</strong> creates a token with its liquidity
            reserve held inside the contract. The token owner later sets the
            starting price and launches from the owner console. Supply, base
            currency, and the launch decay schedule are fixed at deployment.
          </p>
        </section>
        <section>
          <h2>Choose the base</h2>
          <p>
            Native ETH is always supported. IMD and FWA are registered external
            bases; their live permission is checked before a new launch. Another
            base must be enabled in the hook registry, or be an already
            launched, ETH-paired ERC20T using this hook with pairing enabled.
          </p>
          <p>
            Pool eligibility does not guarantee compatible behavior from every
            external token. The entire transaction is simulated before signing.
          </p>
        </section>
        <section>
          <h2>Tax with a clear split</h2>
          <p>
            The resting buy / sell tax is 0.3–5%, charged on swap output. It
            includes a 0.15% protocol component. The remaining resting tax goes
            to the regular recipient. Fees are converted to ETH automatically.
          </p>
          <p>
            Optional launch decay starts at 99%. It drops one percentage point
            per completed interval, clamped at the resting rate. The extra tax
            above resting goes to a separate decay recipient. The owner cannot
            change resting tax while decay is active.
          </p>
        </section>
        <section>
          <h2>Transfers and swaps</h2>
          <p>
            Ordinary direct transfers between wallets without contract code are
            untaxed. Owner and approved distributor transfers have exemptions.
            Other transfers, including ordinary contract-mediated transfers and
            delegated accounts, are restricted by the token.
          </p>
          <p>
            The shared hook supports exact-input swaps only. Fee conversions and
            the base token’s own pool can affect execution. A displayed tax rate
            is not a guaranteed trade quote.
          </p>
        </section>
        <section>
          <h2>What an owner can change</h2>
          <p>
            Change the regular and decay fee recipients independently, adjust
            the resting tax outside active decay, approve local distributors,
            and opt in or out of the global distributor registry.
          </p>
          <p>
            External liquidity permission allows anyone to add to the canonical
            pool; the original position stays locked. An ETH-paired token can
            enable its use as a base for new markets. Disabling pairing does not
            break existing pairs.
          </p>
        </section>
        <section>
          <h2>What stays fixed</h2>
          <p>
            The implementation, shared hook, quote token, and infrastructure are
            bound into each clone. Tokens have no mint function; holders can
            burn. The initial position is locked forever by the deployed
            contract. Gas is still required to deploy and launch.
          </p>
          <p>
            Discovery uses factory events indexed by Blockscout, then checks the
            clone’s bytecode and reads token state from Ethereum. Live read
            failures are shown explicitly, with retry controls.
          </p>
        </section>
      </div>
      <section className="deployment-addresses">
        <h2>The deployed contracts</h2>
        <p className="muted">Ethereum mainnet · chain ID 1</p>
        {Object.entries(CONTRACTS)
          .slice(0, 3)
          .map(([name, address]) => (
            <div key={name}>
              <strong>
                {name === "factory"
                  ? "Token factory"
                  : name === "hook"
                    ? "Shared tax hook"
                    : "Token implementation"}
              </strong>
              <AddressValue address={address} />
            </div>
          ))}
        <a
          className="text-link"
          href="https://sourcify.dev/#/lookup/0xed9a04fa6693e754661a22502524df9b1857e544"
          target="_blank"
          rel="noreferrer"
        >
          View verified source on Sourcify
          <ChevronRight size={16} />
        </a>
      </section>
    </article>
  );
}
