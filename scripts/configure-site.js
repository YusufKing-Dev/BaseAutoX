#!/usr/bin/env node
// Builds index.html from index.template.html. Run it after the token is deployed.
//
//   node scripts/configure-site.js --deployment deployments/base.json
//   node scripts/configure-site.js --token 0x... --deploy-ts 1790000000
//
// Optional (anything you leave out is removed from the page, nothing shows a dead link):
//   --github URL  --x URL  --telegram URL  --site URL  --logo URL
const fs = require("fs");
const a = process.argv.slice(2);
const get = (k) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : ""; };

// Either --deployment deployments/base.json (written by deploy.js) or --token + --deploy-ts
let token = get("token"), deployTs = get("deploy-ts");
const depFile = get("deployment");
if (depFile) {
  const d = JSON.parse(fs.readFileSync(depFile, "utf8"));
  token = token || d.contract;
  deployTs = deployTs || String(d.deployedAt);
}
if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
  throw new Error("--deployment <file> or --token <deployed token address> is required");
}
if (!deployTs) console.warn("Warning: no --deploy-ts; unlock dates will be shown relative to today, not deployment.");

const x = get("x"), tg = get("telegram"), gh = get("github"), site = get("site"), logo = get("logo");
const handle = (url, pre) => url.replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com|t\.me)\//, "").split("?")[0].replace(/^/, pre);

let h = fs.readFileSync("index.template.html", "utf8");
const drop = (re) => { h = h.replace(re, ""); };
const dropLines = (marker) => { h = h.split("\n").filter((l) => !l.includes(marker)).join("\n"); };

// Optional pieces: remove the whole element when its value is not provided.
if (!logo) { drop(/\s*<div class="logo-icon">[\s\S]*?<\/div>/); dropLines("%%LOGO_URL%%"); }
if (!site) dropLines("%%SITE_URL%%");
if (!gh) {
  drop(/\s*<a href="%%GITHUB_URL%%" target="_blank">\s*<button[^>]*>[^<]*<\/button>\s*<\/a>/);
  drop(/\s*<a href="%%GITHUB_URL%%" target="_blank">GitHub<\/a>[^\S\n]*·?/);
  dropLines("%%GITHUB_URL%%");
}
const card = (m) => new RegExp('\\s*<a class="social-card" href="%%' + m + '%%"[\\s\\S]*?</a>');
if (!tg) { drop(card("TG_URL")); drop(/\s*<a href="%%TG_URL%%" target="_blank">Telegram<\/a>[^\S\n]*·?/); dropLines("%%TG_URL%%"); }
if (!x) { drop(card("X_URL")); drop(/\s*<a href="%%X_URL%%" target="_blank">X<\/a>[^\S\n]*·?/); dropLines("%%X_URL%%"); dropLines("%%X_HANDLE%%"); }
if (!tg && !x) { drop(/\s*<section id="social"[\s\S]*?<\/section>/); drop(/\s*<a href="#social">[^<]*<\/a>/); }
// tidy: dangling "·" before </footer>, trailing comma before "]" in the JSON-LD
h = h.replace(/[^\S\n]*·\s*<\/footer>/, "\n</footer>").replace(/,(\s*\])/g, "$1");

const map = {
  TOKEN: token, DEPLOY_TS: deployTs, GITHUB_URL: gh, X_URL: x, TG_URL: tg, SITE_URL: site, LOGO_URL: logo,
  X_HANDLE: x ? handle(x, "@") : "", TG_HANDLE: tg ? handle(tg, "t.me/") : "",
};
for (const [k, v] of Object.entries(map)) h = h.split(`%%${k}%%`).join(v);
const left = h.match(/%%[A-Z_]+%%/g);
if (left) throw new Error("Unfilled placeholders: " + [...new Set(left)].join(", "));
fs.writeFileSync("index.html", h);
console.log("index.html written.");
