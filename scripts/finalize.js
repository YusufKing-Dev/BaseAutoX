// Use when the token was ALREADY deployed but the deploy script failed before it could
// record/verify it. Never deploys anything. Reads the contract, saves deployments/<network>.json
// and verifies the source on Basescan.
const { ethers, network, run } = require("hardhat");
require("dotenv").config();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 15, ms = 4000) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= tries - 1) throw e; await sleep(ms); }
  }
}
const fmtDate = (ts) => new Date(Number(ts) * 1000).toISOString().split("T")[0];

async function main() {
  const address = process.env.EXISTING_ADDRESS;
  const treasury = process.env.TREASURY_ADDRESS;
  if (!ethers.isAddress(address || "")) throw new Error("Set EXISTING_ADDRESS to the deployed token address");
  if (!ethers.isAddress(treasury || "")) throw new Error("Set TREASURY_ADDRESS to a valid address");

  const code = await retry(() => ethers.provider.getCode(address));
  if (code === "0x") throw new Error(`No contract code at ${address} on ${network.name}`);

  const bax = await ethers.getContractAt("BaseAutoXToken", address);
  const symbol = await retry(() => bax.symbol());
  if (symbol !== "BAX") throw new Error(`Contract at ${address} is not BAX (symbol=${symbol})`);
  const deployedAt = await retry(() => bax.deployedAt());
  const onChainTreasury = await retry(() => bax.treasury());
  if (onChainTreasury.toLowerCase() !== treasury.toLowerCase()) {
    throw new Error(`Treasury mismatch: contract has ${onChainTreasury}, TREASURY_ADDRESS is ${treasury}`);
  }
  console.log(`Found BAX at ${address}, deployed ${fmtDate(deployedAt)} (${deployedAt}), treasury ${onChainTreasury}`);

  const [deployer] = await ethers.getSigners();
  const years = [1, 2, 3, 4];
  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    contract: address,
    treasury,
    deployer: deployer.address,
    deployedAt: Number(deployedAt),
    deployedAtISO: fmtDate(deployedAt),
    maxSupply: "430000000",
    genesisSupply: "64500000",
    annualUnlock: "91375000",
    unlockSchedule: years.map((y) => ({
      year: y,
      unlockDate: fmtDate(deployedAt + BigInt(y) * BigInt(365 * 24 * 60 * 60)),
    })),
  };
  const fs = require("fs");
  if (!fs.existsSync("./deployments")) fs.mkdirSync("./deployments");
  fs.writeFileSync(`./deployments/${network.name}.json`, JSON.stringify(deployment, null, 2));
  console.log(`Saved deployments/${network.name}.json`);

  try {
    await run("verify:verify", { address, constructorArguments: [treasury] });
    console.log("Contract verified on Basescan");
  } catch (err) {
    if (err.message.includes("Already Verified")) console.log("Contract already verified");
    else console.warn("Verification failed:", err.message);
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
