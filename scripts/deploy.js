const { ethers, network, run } = require("hardhat");
require("dotenv").config();

const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmt(wei) {
  return Number(ethers.formatEther(wei)).toLocaleString("en-US") + " BAX";
}

function fmtDate(ts) {
  return new Date(Number(ts) * 1000).toISOString().split("T")[0];
}

async function main() {
  if (!ethers.isAddress(TREASURY_ADDRESS || "")) {
    throw new Error("Set TREASURY_ADDRESS in .env to a valid address");
  }
  console.log("\n══════════════════════════════════════════════════");
  console.log("  BaseAutoX (BAX) — Deployment Script");
  console.log("══════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();

  console.log(`Network    : ${network.name}`);
  console.log(`Deployer   : ${deployer.address}`);
  console.log(`Treasury   : ${TREASURY_ADDRESS}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`ETH balance: ${ethers.formatEther(balance)} ETH\n`);

  // ─── Deploy ────────────────────────────────────────────────────────────────

  console.log("Deploying BaseAutoXToken contract...");
  const BAX = await ethers.getContractFactory("BaseAutoXToken");
  const bax = await BAX.deploy(TREASURY_ADDRESS);
  await bax.waitForDeployment();

  const contractAddress = await bax.getAddress();
  const deployedAt = await bax.deployedAt();

  console.log(`\n✓ BaseAutoXToken deployed to: ${contractAddress}`);
  console.log(`  Deployed at    : ${fmtDate(deployedAt)} (${deployedAt})`);

  // ─── Verify post-deploy state ─────────────────────────────────────────────

  console.log("\n── Token Details ─────────────────────────────────");
  console.log(`  Name       : ${await bax.name()}`);
  console.log(`  Symbol     : ${await bax.symbol()}`);
  console.log(`  Decimals   : ${await bax.decimals()}`);
  console.log(`  Max Supply : ${fmt(await bax.MAX_SUPPLY())}`);
  console.log(`  Circulating: ${fmt(await bax.totalSupply())}`);

  console.log("\n── Unlock Schedule ───────────────────────────────");
  const years = [1, 2, 3, 4];
  for (const y of years) {
    const ts = await bax.unlockTimestamp(y);
    const claimed = await bax.unlockClaimed(y);
    console.log(
      `  Year ${y}: ${fmtDate(ts)}  claimed=${claimed}`
    );
  }

  // ─── Save deployment artefact ─────────────────────────────────────────────

  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    contract: contractAddress,
    treasury: TREASURY_ADDRESS,
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
  const outDir = "./deployments";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outPath = `${outDir}/${network.name}.json`;
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`\n✓ Deployment info saved to ${outPath}`);

  // ─── Source verification ───────────────────────────────────────────────────

  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting 5 confirmations before verification...");
    await bax.deploymentTransaction().wait(5);

    console.log("Verifying on Basescan...");
    try {
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [TREASURY_ADDRESS],
      });
      console.log("✓ Contract verified on Basescan");
    } catch (err) {
      if (err.message.includes("Already Verified")) {
        console.log("✓ Contract already verified");
      } else {
        console.warn("⚠ Verification failed:", err.message);
      }
    }
  }

  console.log("\n══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
