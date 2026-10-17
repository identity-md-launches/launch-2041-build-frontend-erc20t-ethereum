/** Production browser validation. Wallet fixture rejects every signing request. */
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, join } from "node:path";
import assert from "node:assert/strict";
import { createPublicClient, http, parseAbi, decodeFunctionData } from "viem";
import { mainnet } from "viem/chains";
const out = resolve("test/scratch/interactions");
await mkdir(out, { recursive: true });
const root = resolve("dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    assert(pathname.startsWith("/preview/"));
    const path = resolve(
      root,
      decodeURIComponent(pathname.slice(9) || "index.html"),
    );
    assert(path.startsWith(root + "/"));
    const data = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/preview/`;
const report = { checks: [], limitations: [], axe: [], errors: [] };
let activePage;
let safari;
async function check(name, fn) {
  try {
    await fn();
    report.checks.push({ name, passed: true });
    console.log("PASS", name);
  } catch (e) {
    report.checks.push({ name, passed: false, error: e.message });
    console.error("FAIL", name, e.message);
    if (activePage)
      await activePage
        .screenshot({
          path: join(out, "failure-" + report.checks.length + ".png"),
          fullPage: true,
        })
        .catch(() => {});
    throw e;
  }
}
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
activePage = page;
page.on("pageerror", (e) => report.errors.push(e.message));
const localFailures = [];
page.on("response", (r) => {
  if (r.url().startsWith(origin) && r.status() >= 400)
    localFailures.push(r.url().split("/preview/")[1]);
});
async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  report.axe.push({
    label,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
  assert.equal(
    result.violations.length,
    0,
    `${label}: ${result.violations.map((v) => v.id).join(", ")}`,
  );
}
async function basicFlow(p) {
  await p.goto(origin);
  await p
    .getByRole("button", { name: "Continue to launch", exact: true })
    .click();
  await p.getByText("Give your token a name.", { exact: true }).waitFor();
  assert.equal(await p.evaluate(() => document.activeElement.id), "name");
  await p.getByLabel("Token name", { exact: true }).fill("Moon Garden");
  await p.getByLabel("Symbol", { exact: true }).fill("GARDEN");
  await p
    .getByRole("button", { name: "Continue to launch", exact: true })
    .click();
  await p.getByRole("heading", { name: "Shape your launch" }).waitFor();
  await p
    .getByText("ETH is eligible for this launch", { exact: true })
    .waitFor();
}
try {
  await check(
    "Static export loads at a subpath with title, favicon, local font and share image",
    async () => {
      await page.goto(origin);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.title(), "ERC20T · Create an Ethereum token");
      assert.equal(
        (await page.request.get(origin + "share.png")).status(),
        200,
      );
      assert(
        await page.evaluate(() => document.fonts.check('400 16px "DM Sans"')),
      );
      assert.equal(localFailures.length, 0);
    },
  );
  await check(
    "Responsive entry at 320, 390, 780 and 1440; primary action on first 390 screen",
    async () => {
      for (const width of [320, 390, 780, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `overflow at ${width}`,
        );
        if (width === 390) {
          const box = await page
            .getByRole("button", { name: "Continue to launch", exact: true })
            .boundingBox();
          assert(box.y + box.height < 844, `CTA bottom ${box.y + box.height}`);
        }
        await page.screenshot({
          path: join(out, `create-${width}.png`),
          fullPage: true,
        });
      }
      await axe(page, "Create desktop");
    },
  );
  await check(
    "Wallet dialog traps focus, restores trigger and handles no-provider rejection",
    async () => {
      const trigger = page.getByRole("button", {
        name: "Connect",
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Connect a wallet" });
      await dialog.waitFor();
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press("Tab");
        assert(
          await page.evaluate(() =>
            document.querySelector("dialog").contains(document.activeElement),
          ),
        );
      }
      await dialog
        .getByRole("button", { name: "Browser wallet", exact: true })
        .click();
      await dialog.getByRole("alert").waitFor();
      await page.keyboard.press("Escape");
      assert(await trigger.evaluate((el) => el === document.activeElement));
    },
  );
  await check(
    "Token validation focuses invalid field and preserves values through steps",
    async () => {
      await basicFlow(page);
      await page.getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(
        await page.getByLabel("Token name", { exact: true }).inputValue(),
        "Moon Garden",
      );
      await page.getByLabel("Total supply", { exact: true }).fill("0");
      await page
        .getByRole("button", { name: "Continue to launch", exact: true })
        .click();
      await page
        .getByText("Enter an amount greater than zero.", { exact: true })
        .waitFor();
      await page.getByLabel("Total supply", { exact: true }).fill("1000000000");
      await page
        .getByRole("button", { name: "Continue to launch", exact: true })
        .click();
    },
  );
  await check(
    "Allocation, tax and launch decay update the preview; interval validation blocks review",
    async () => {
      await page.getByLabel("Creator allocation", { exact: true }).focus();
      await page.keyboard.press("End");
      assert.equal(
        await page
          .getByLabel("Creator allocation", { exact: true })
          .inputValue(),
        "20",
      );
      await page.getByLabel("Resting buy / sell tax", { exact: true }).focus();
      await page.keyboard.press("Home");
      await page.getByRole("switch").check();
      await page.getByLabel("Seconds per 1 percentage point drop").fill("0");
      await page
        .getByRole("button", { name: "Review token", exact: true })
        .click();
      await page
        .getByText("Use a whole number of seconds from 1 to 4,294,967,295.", {
          exact: true,
        })
        .waitFor();
      await page.getByLabel("Seconds per 1 percentage point drop").fill("30");
      await page
        .getByText("Resting after 49.5 minutes", { exact: true })
        .waitFor();
    },
  );
  await check(
    "IMD and FWA eligibility and custom-base validation use Ethereum",
    async () => {
      await page.getByRole("button", { name: "IMD", exact: true }).click();
      await page
        .getByText("IMD is eligible for this launch", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Other", exact: true }).click();
      await page
        .getByLabel("Base token address", { exact: true })
        .fill("invalid");
      await page
        .getByRole("button", { name: "Check eligibility", exact: true })
        .click();
      await page
        .getByText("Paste a valid ERC-20 contract address.", { exact: true })
        .waitFor();
      await page
        .getByLabel("Base token address", { exact: true })
        .fill("0xa0df17b5ac76ababa36e1450e2cbcd18a620c845");
      await page
        .getByRole("button", { name: "Check eligibility", exact: true })
        .click();
      await page
        .getByText("FWA is eligible for this launch", { exact: true })
        .waitFor();
    },
  );
  await check(
    "Recipient validation, rounded contract preview and pre-sign connection prompt",
    async () => {
      await page
        .locator("summary")
        .filter({ hasText: "Fee recipients" })
        .click();
      await page
        .getByLabel("Regular fee recipient", { exact: true })
        .fill("not-an-address");
      await page
        .getByRole("button", { name: "Review token", exact: true })
        .click();
      await page
        .getByText("Enter a valid recipient wallet address.", { exact: true })
        .waitFor();
      await page.getByLabel("Regular fee recipient", { exact: true }).fill("");
      await page
        .getByRole("button", { name: "Review token", exact: true })
        .click();
      await page.getByRole("heading", { name: "Ready for Ethereum" }).waitFor();
      await page.locator(".price-value").waitFor();
      assert(
        (await page.locator(".price-value").textContent()).includes("FWA"),
      );
      await page.getByRole("checkbox").check();
      await axe(page, "Create review");
      await page
        .getByRole("button", { name: "Connect to continue", exact: true })
        .click();
      await page.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Deploy-first flow defers price and preserves a reserved liquidity allocation",
    async () => {
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await page.getByRole("radio", { name: /Deploy first/ }).check();
      await page
        .getByRole("button", { name: "Continue to launch", exact: true })
        .click();
      assert.equal(await page.locator("#price").count(), 0);
      await page
        .getByRole("button", { name: "Review token", exact: true })
        .click();
      await page.getByText("Deploy only", { exact: true }).waitFor();
      await page
        .getByText("Supply and base token are fixed at deployment.", {
          exact: true,
        })
        .waitFor();
    },
  );
  await check(
    "Discovery loads real deployments; search and status/base filters recover from empty states",
    async () => {
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "Explore", exact: true })
        .click();
      await page.locator(".token-card").first().waitFor({ timeout: 40000 });
      const name = await page.locator(".token-card h2 a").first().textContent();
      await page.getByRole("searchbox").fill(name);
      assert((await page.locator(".token-card").count()) >= 1);
      await page.getByRole("searchbox").fill("No token has this search string");
      await page.getByRole("heading", { name: "No matching tokens" }).waitFor();
      await page
        .getByRole("button", { name: "Clear filters", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Awaiting launch", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Awaiting launch", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page
        .getByRole("button", { name: "All tokens", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "Filter by base" })
        .selectOption("0xa0df17b5ac76ababa36e1450e2cbcd18a620c845");
      await axe(page, "Explore");
      await page.screenshot({
        path: join(out, "explore-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "Live token detail, complete addresses and owner-only permissions",
    async () => {
      await page.goto(
        origin + "#/token/0xA639FA428738787388a8290baC439B8fFBF9599a",
      );
      await page
        .getByRole("heading", { name: "Market overview" })
        .waitFor({ timeout: 40000 });
      assert.equal(await page.locator(".large-tax strong").textContent(), "5%");
      assert.equal(
        await page
          .getByRole("button", { name: "Review recipient change" })
          .isDisabled(),
        true,
      );
      await page
        .getByRole("button", { name: "Permissions", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Pairing permission", exact: true })
        .waitFor();
      await page.getByLabel("Check a distributor’s access").fill("invalid");
      await page
        .getByRole("button", { name: "Check permissions", exact: true })
        .click();
      await page
        .getByText("Enter a valid Ethereum address.", { exact: true })
        .waitFor();
      await page
        .locator("summary")
        .filter({ hasText: "Contract details" })
        .click();
      assert(
        await page
          .locator(".technical-details")
          .textContent()
          .then((t) =>
            t.includes("0x91e758bEa19c65A7FBFd10d78810D38456945908"),
          ),
      );
      await axe(page, "Token permissions");
      for (const width of [320, 390, 780, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `token overflow ${width}`,
        );
      }
      await page.screenshot({
        path: join(out, "token-desktop.png"),
        fullPage: true,
      });
    },
  );
  await check(
    "Mobile wallet sheet offers all four in-app paths plus Coinbase Smart Wallet",
    async () => {
      const phone = await browser.newContext({ ...devices["iPhone 13"] });
      const p = await phone.newPage();
      await p.goto(origin);
      await p.getByRole("button", { name: "Connect", exact: true }).click();
      for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
        await p
          .getByRole("link", { name: `Open in ${name}`, exact: true })
          .waitFor();
      await p
        .getByRole("button", { name: "Coinbase Smart Wallet", exact: true })
        .waitFor();
      assert(
        (
          await p
            .getByRole("link", { name: "Open in Rabby", exact: true })
            .getAttribute("href")
        ).includes("_cmd=open-dapp&dapp="),
      );
      assert((await p.getByRole("dialog").boundingBox()).y > 0);
      await p.screenshot({ path: join(out, "wallet-mobile.png") });
      await axe(p, "Mobile wallet");
      await phone.close();
    },
  );
  await check(
    "Offline discovery shows a recoverable error, with address lookup still available",
    async () => {
      const offline = await browser.newContext();
      const p = await offline.newPage();
      await p.route("https://eth.blockscout.com/**", (route) => route.abort());
      await p.goto(origin + "#/explore");
      await p
        .getByRole("button", { name: "Retry discovery", exact: true })
        .waitFor({ timeout: 20000 });
      await p
        .getByRole("button", { name: "Open token", exact: true })
        .waitFor();
      await offline.close();
    },
  );
  await check(
    "No uncaught page errors or failed local resources in primary flows",
    async () => {
      assert.deepEqual(report.errors, []);
      assert.deepEqual(localFailures, []);
    },
  );
  // A synthetic EIP-6963 provider returns a public onchain owner address and always rejects signing.
  const rpc = createPublicClient({
    chain: mainnet,
    transport: http("https://ethereum-rpc.publicnode.com"),
  });
  const observedOwner = await rpc.readContract({
    address: "0xA639FA428738787388a8290baC439B8fFBF9599a",
    abi: parseAbi(["function owner() view returns (address)"]),
    functionName: "owner",
  });
  const walletContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await walletContext.addInitScript(
    ({ account }) => {
      const callbacks = {};
      let chain = "0x1";
      let authorized =
        localStorage.getItem("validation-wallet-authorized") === "true";
      window.__walletCalls = [];
      const provider = {
        request: async ({ method, params }) => {
          window.__walletCalls.push({ method, params });
          if (method === "eth_requestAccounts") {
            authorized = true;
            localStorage.setItem("validation-wallet-authorized", "true");
            return [account];
          }
          if (method === "eth_accounts") return authorized ? [account] : [];
          if (method === "eth_chainId") return chain;
          if (
            method === "wallet_switchEthereumChain" ||
            method === "wallet_addEthereumChain"
          ) {
            chain = params[0].chainId;
            for (const cb of callbacks.chainChanged || []) cb(chain);
            return null;
          }
          if (method === "eth_sendTransaction") {
            window.__lastTransaction = params[0];
            throw Object.assign(
              new Error("User rejected test signing request"),
              { code: 4001 },
            );
          }
          if (method.startsWith("eth_sign") || method === "personal_sign")
            throw Object.assign(new Error("All signing disabled in tests"), {
              code: 4001,
            });
          if (method === "wallet_getCapabilities") return {};
          const r = await fetch("https://ethereum-rpc.publicnode.com", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          });
          const data = await r.json();
          if (data.error)
            throw Object.assign(new Error(data.error.message), data.error);
          return data.result;
        },
        on: (event, cb) => {
          (callbacks[event] ||= []).push(cb);
        },
        removeListener: (event, cb) => {
          callbacks[event] = (callbacks[event] || []).filter((f) => f !== cb);
        },
      };
      window.ethereum = provider;
      window.__setChain = (next) => {
        chain = next;
        for (const callback of callbacks.chainChanged || []) callback(chain);
      };
      const announce = () =>
        dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "1a5230d0-a949-40e8-9f14-31afd3f25155",
                name: "Validation wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="%23242b23"/></svg>',
                rdns: "test.erc20t.wallet",
              },
              provider,
            },
          }),
        );
      addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account: observedOwner },
  );
  const w = await walletContext.newPage();
  activePage = w;
  await check(
    "EIP-6963 named wallet, wrong-chain switch, owner permissions and rejected transaction",
    async () => {
      await w.goto(
        origin + "#/token/0xA639FA428738787388a8290baC439B8fFBF9599a",
      );
      await w.getByRole("button", { name: "Connect", exact: true }).click();
      await w
        .getByRole("button", { name: "Validation wallet", exact: true })
        .click();
      await w
        .getByText("Connected as the token owner", { exact: true })
        .waitFor();
      await w.evaluate(() => window.__setChain("0xaa36a7"));
      await w
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .waitFor();
      await w
        .getByRole("button", { name: "Switch to Ethereum", exact: true })
        .click();
      await w
        .getByText("Connected as the token owner", { exact: true })
        .waitFor();
      await w
        .getByRole("button", { name: "Review recipient change", exact: true })
        .click();
      await w
        .getByRole("dialog", { name: "Update regular recipient", exact: true })
        .waitFor();
      await w
        .getByRole("button", { name: "Confirm in wallet", exact: true })
        .click();
      await w
        .getByText(
          "The wallet request was declined. Your settings are still here; try again when ready.",
          { exact: true },
        )
        .waitFor({ timeout: 30000 });
      const sent = await w.evaluate(() => window.__lastTransaction);
      assert.equal(
        sent.to.toLowerCase(),
        "0xa639fa428738787388a8290bac439b8ffbf9599a",
      );
      const abi = JSON.parse(await readFile("src/contracts/token.json"));
      assert.equal(
        decodeFunctionData({ abi, data: sent.data }).functionName,
        "setFeeRecipient",
      );
      assert.equal(
        await w
          .getByRole("button", { name: "Confirm in wallet", exact: true })
          .isEnabled(),
        true,
      );
      await w.keyboard.press("Escape");
      await w.getByRole("button", { name: "Permissions", exact: true }).click();
      assert.equal(
        await w
          .getByRole("button", { name: "Review enable", exact: true })
          .last()
          .isDisabled(),
        true,
      );
    },
  );
  await check(
    "Atomic launch reaches wallet with correct verified ABI, base units and zero base deposit",
    async () => {
      await basicFlow(w);
      await w
        .getByRole("button", { name: "Review token", exact: true })
        .click();
      await w.locator(".price-value").waitFor();
      await w.getByRole("checkbox").check();
      await w
        .getByRole("button", { name: "Deploy & launch token", exact: true })
        .click();
      await w
        .getByText(
          "The wallet request was declined. Your settings are still here; try again when ready.",
          { exact: true },
        )
        .waitFor({ timeout: 30000 });
      const sent = await w.evaluate(() => window.__lastTransaction);
      assert.equal(
        sent.to.toLowerCase(),
        "0x801411c6acec4fa80c75c5d3c0eae13c84f8a173",
      );
      assert.equal(BigInt(sent.value || "0x0"), 0n);
      const abi = JSON.parse(await readFile("src/contracts/factory.json"));
      const decoded = decodeFunctionData({ abi, data: sent.data });
      assert.equal(decoded.functionName, "createAndLaunchAtPrice");
      assert.equal(decoded.args[1], 1000);
      assert.equal(decoded.args[2], 10000000000n);
      assert.equal(
        decoded.args[0].owner.toLowerCase(),
        observedOwner.toLowerCase(),
      );
    },
  );
  await walletContext.close();
  try {
    safari = await webkit.launch({ headless: true });
  } catch (e) {
    report.limitations.push(`WebKit unavailable: ${e.message.slice(0, 350)}`);
    console.warn("WebKit unavailable");
  }
  if (safari) {
    const p = await safari.newPage({ viewport: { width: 390, height: 844 } });
    activePage = p;
    await check(
      "WebKit mobile completes token form, launch review and native wallet dialog",
      async () => {
        await basicFlow(p);
        await p
          .getByRole("button", { name: "Review token", exact: true })
          .click();
        await p.locator(".price-value").waitFor();
        await p
          .getByRole("button", { name: "Connect to continue", exact: true })
          .click();
        await p.getByRole("dialog", { name: "Connect a wallet" }).waitFor();
        await p.keyboard.press("Escape");
        assert(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await p.screenshot({
          path: join(out, "webkit-review.png"),
          fullPage: true,
        });
      },
    );
    await safari.close();
  }
} catch (e) {
  console.error("Browser validation stopped:", e.message);
  process.exitCode = 1;
} finally {
  await safari?.close().catch(() => {});
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(join(out, "results.json"), JSON.stringify(report, null, 2));
  console.log(
    `${report.checks.filter((c) => c.passed).length}/${report.checks.length} interaction checks passed.`,
  );
}
