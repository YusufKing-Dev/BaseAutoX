# BAX — BaseAutoX Token

Fixed-supply ERC-20 on Base with a 4-year phased release. Same token mechanics as Osmotix (OSM), without a presale.

| Property | Value |
|---|---|
| Name / Symbol | BaseAutoX / BAX |
| Network | Base (chain ID 8453) |
| Max supply | 430,000,000 BAX (18 decimals) |
| Genesis (minted at deploy) | 64,500,000 (15%) |
| Annual unlocks | 4 × 91,375,000 (21.25% each), claimable after 365/730/1095/1460 days |

No tax, no blacklist, no upgrade path. Unlocked tokens always mint to the treasury (`0x0677f145dfd3be8e1a0b714ff53d145b40131397`, set in `.env`; it cannot be changed after deployment).

> Supply and schedule are copied from OSM. Change the constants in `contracts/BaseAutoXToken.sol` *before* deploying if BAX should differ; they cannot be changed afterwards.
> This is a different contract from the BaseAutoX swap-policy contract (`BaseAutoX.sol`), which is not a token.

## Layout

```
contracts/BaseAutoXToken.sol   token + unlock schedule
scripts/deploy.js              deploy + verify on Basescan
scripts/configure-site.js      fills index.template.html -> index.html
test/BaseAutoXToken.test.js    Hardhat tests
.github/workflows/deploy.yml   manual deploy workflow
```

## Deploy

```bash
npm install
cp .env.example .env      # PRIVATE_KEY, TREASURY_ADDRESS, BASESCAN_API_KEY
npm test                  # must pass before any deploy
npm run deploy:testnet    # Base Sepolia rehearsal
npm run deploy:mainnet    # Base mainnet
```

The deploy saves the address and `deployedAt` timestamp to `deployments/base.json`. Use a fresh deploy wallet for `PRIVATE_KEY`, never your main wallet, and do not commit `.env`.

GitHub Actions alternative: add repository secrets `PRIVATE_KEY`, `TREASURY_ADDRESS`, `BASE_RPC_URL`, `BASESCAN_API_KEY`, then run **Deploy BAX Token** from the Actions tab.

## Deploying from a phone (no PC needed)

Everything runs in GitHub Actions, so you only need the GitHub website.

1. Create the repo and add these files with the same folder structure. The GitHub website cannot unzip, so either add files one by one (**Add file → Create new file**, typing the path such as `contracts/BaseAutoXToken.sol`, which creates the folders) or open a Codespace on the repo, upload the zip, run `unzip` and `git push`.
2. Repo **Settings → Secrets and variables → Actions → New repository secret**:
   - `PRIVATE_KEY`: key of a **fresh** wallet funded with a small amount of Base ETH (about 0.002 ETH covers the deploy). Never your main wallet.
   - `BASESCAN_API_KEY`: free key from basescan.org / etherscan.io (verification failing only prints a warning; the deploy still succeeds).
   - `TREASURY_ADDRESS` is optional; the workflow already defaults to `0x0677f145dfd3be8e1a0b714ff53d145b40131397`.
3. **Actions → Deploy BAX Token → Run workflow**. Pick `base-sepolia` first to rehearse, then `base`.
4. A mainnet run tests, deploys, verifies, then commits `deployments/base.json` and `index.html` for you.
5. **Settings → Pages → Deploy from branch → `main` / root** to publish the site.
6. When you have X, Telegram, a logo or the Pages URL: **Actions → Update Site → Run workflow** and fill in the links.

After the deploy, delete the `PRIVATE_KEY` secret.

## Website (GitHub Pages)

Run this after the token is deployed. Only `--token` is required; anything you leave out (X, Telegram, GitHub, logo, site URL) is removed from the page instead of leaving a dead link.

```bash
node scripts/configure-site.js --deployment deployments/base.json
# later, once you have them:
#   --github https://github.com/YOU/REPO --x https://x.com/HANDLE --telegram https://t.me/GROUP \
#   --site https://YOU.github.io/REPO/ --logo https://URL/logo.png
```

This writes `index.html`. Commit it, then in the repo go to Settings → Pages → Deploy from branch → `main` / root.

## Claiming unlocks

After a year has passed, anyone can call `claimAnnualUnlock(1)` (then 2, 3, 4). `unlockTimestamp(year)` shows when each opens.

## License

MIT
