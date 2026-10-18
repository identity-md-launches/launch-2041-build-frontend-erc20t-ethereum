import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const font = (await readFile("public/fonts/dm-sans-latin.woff2")).toString(
  "base64",
);
await page.setContent(
  `<html><head><style>@font-face{font-family:DM;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 1000}*{box-sizing:border-box}body{margin:0;background:#f6f5f1;color:#242b23;font-family:DM,Arial}header{margin:50px 65px 0;border-bottom:1px solid #dedfd5;padding-bottom:30px;display:flex;gap:14px;align-items:center;font-size:36px;font-weight:600;letter-spacing:-1px}.star{color:#bf4026;font-size:72px;line-height:.6}main{padding:48px 65px;position:relative}h1{font-size:76px;letter-spacing:-4px;line-height:1.08;margin:0;font-weight:600}p{font-size:26px;color:#61665b;margin-top:26px}.button{margin-top:36px;padding:17px 25px;border-radius:10px;background:#bf4026;color:white;display:inline-block;font-size:24px;font-weight:500}.coin{position:absolute;right:65px;top:102px;width:240px;height:240px;border-radius:50%;background:#f27752;border:3px solid #242b23;display:flex;align-items:center;justify-content:center;transform:rotate(-15deg)}.coin:after{content:'';position:absolute;inset:12px;border:2px solid #a83c22;border-radius:50%}</style></head><body><header><svg width="40" height="40" viewBox="0 0 40 40"><path d="M17 2h6v36h-6zM2.9 13.6l3-5.2 31.2 18-3 5.2zM5.9 31.6l-3-5.2 31.2-18 3 5.2z" fill="#bf4026"/></svg>ERC20T</header><main><h1>Your token.<br>Its own market<span style="color:#bf4026">.</span></h1><p>Ethereum + Robinhood. Choose your market cap.</p><div class="button">Create a token →</div><div class="coin"><svg width="140" height="140" viewBox="0 0 40 40"><path d="M17 2h6v36h-6zM2.9 13.6l3-5.2 31.2 18-3 5.2zM5.9 31.6l-3-5.2 31.2-18 3 5.2z" fill="#fff8e9"/></svg></div></main></body></html>`,
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "public/share.png" });
await browser.close();
console.log("Generated public/share.png (1200 × 630)");
