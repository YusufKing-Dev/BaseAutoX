const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// ─── Constants ────────────────────────────────────────────────────────────────

const DECIMALS       = 18n;
const ONE            = 10n ** DECIMALS;
const MAX_SUPPLY     = 430_000_000n * ONE;
const GENESIS_SUPPLY =  64_500_000n * ONE;
const ANNUAL_UNLOCK  =  91_375_000n * ONE;
const YEAR_SECONDS   = 365n * 24n * 3600n;

// ─── Fixture ─────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, treasury, alice, bob] = await ethers.getSigners();
  const BAX = await ethers.getContractFactory("BaseAutoXToken");
  const bax = await BAX.deploy(treasury.address);
  await bax.waitForDeployment();
  return { bax, deployer, treasury, alice, bob };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BAX Token", function () {
  // ── 1. Deployment ───────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets name and symbol correctly", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.name()).to.equal("BaseAutoX");
      expect(await bax.symbol()).to.equal("BAX");
    });

    it("sets 18 decimals", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.decimals()).to.equal(18);
    });

    it("stores the treasury address immutably", async function () {
      const { bax, treasury } = await loadFixture(deployFixture);
      expect(await bax.treasury()).to.equal(treasury.address);
    });

    it("mints GENESIS_SUPPLY to treasury at deployment", async function () {
      const { bax, treasury } = await loadFixture(deployFixture);
      expect(await bax.balanceOf(treasury.address)).to.equal(GENESIS_SUPPLY);
      expect(await bax.totalSupply()).to.equal(GENESIS_SUPPLY);
    });

    it("reports MAX_SUPPLY correctly", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
    });

    it("reports remainingMintable correctly after genesis", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.remainingMintable()).to.equal(MAX_SUPPLY - GENESIS_SUPPLY);
    });

    it("reverts with zero-address treasury", async function () {
      const BAX = await ethers.getContractFactory("BaseAutoXToken");
      await expect(BAX.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "BAX: treasury is zero address"
      );
    });
  });

  // ── 2. Annual Unlock ─────────────────────────────────────────────────────────
  describe("Annual Unlock", function () {
    it("reverts before year 1 unlock window", async function () {
      const { bax, alice } = await loadFixture(deployFixture);
      await expect(bax.connect(alice).claimAnnualUnlock(1)).to.be.revertedWith(
        "BAX: unlock not yet available"
      );
    });

    it("allows anyone to trigger the unlock once the window is open", async function () {
      const { bax, alice, treasury } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS));
      await expect(bax.connect(alice).claimAnnualUnlock(1)).to.not.be.reverted;
      // Tokens land in treasury, not in alice's wallet
      expect(await bax.balanceOf(alice.address)).to.equal(0n);
      expect(await bax.balanceOf(treasury.address)).to.equal(
        GENESIS_SUPPLY + ANNUAL_UNLOCK
      );
    });

    it("emits AnnualUnlockClaimed event with correct args", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS));
      const tx = await bax.claimAnnualUnlock(1);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      await expect(tx)
        .to.emit(bax, "AnnualUnlockClaimed")
        .withArgs(1, ANNUAL_UNLOCK, BigInt(block.timestamp));
    });

    it("cannot claim the same year twice", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS));
      await bax.claimAnnualUnlock(1);
      await expect(bax.claimAnnualUnlock(1)).to.be.revertedWith(
        "BAX: already claimed"
      );
    });

    it("correctly unlocks all four annual tranches", async function () {
      const { bax, treasury } = await loadFixture(deployFixture);
      let expectedSupply = GENESIS_SUPPLY;

      for (let y = 1; y <= 4; y++) {
        await time.increase(Number(YEAR_SECONDS));
        await bax.claimAnnualUnlock(y);
        expectedSupply += ANNUAL_UNLOCK;

        expect(await bax.totalSupply()).to.equal(expectedSupply);
        expect(await bax.unlockClaimed(y)).to.be.true;
      }

      expect(await bax.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("total supply equals MAX_SUPPLY after all unlocks", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS) * 4);
      for (let y = 1; y <= 4; y++) {
        await bax.claimAnnualUnlock(y);
      }
      expect(await bax.totalSupply()).to.equal(MAX_SUPPLY);
      expect(await bax.remainingMintable()).to.equal(0n);
    });

    it("cannot claim year 5 (invalid year)", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS) * 5);
      await expect(bax.claimAnnualUnlock(5)).to.be.revertedWith(
        "BAX: invalid year"
      );
      await expect(bax.claimAnnualUnlock(0)).to.be.revertedWith(
        "BAX: invalid year"
      );
    });

    it("can claim year 3 before year 2 if time has passed for both", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS) * 3);
      // Year 3 should be claimable even if year 2 hasn't been claimed yet
      await expect(bax.claimAnnualUnlock(3)).to.not.be.reverted;
      await expect(bax.claimAnnualUnlock(2)).to.not.be.reverted;
    });
  });

  // ── 3. Unlock Schedule View Helpers ─────────────────────────────────────────
  describe("View Helpers", function () {
    it("unlockTimestamp returns correct timestamps", async function () {
      const { bax } = await loadFixture(deployFixture);
      const deployedAt = await bax.deployedAt();
      for (let y = 1n; y <= 4n; y++) {
        expect(await bax.unlockTimestamp(y)).to.equal(
          deployedAt + y * YEAR_SECONDS
        );
      }
    });

    it("claimedUnlocks increments as unlocks are claimed", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.claimedUnlocks()).to.equal(0n);

      await time.increase(Number(YEAR_SECONDS));
      await bax.claimAnnualUnlock(1);
      expect(await bax.claimedUnlocks()).to.equal(1n);

      await time.increase(Number(YEAR_SECONDS));
      await bax.claimAnnualUnlock(2);
      expect(await bax.claimedUnlocks()).to.equal(2n);
    });

    it("remainingMintable decreases as unlocks are claimed", async function () {
      const { bax } = await loadFixture(deployFixture);
      expect(await bax.remainingMintable()).to.equal(MAX_SUPPLY - GENESIS_SUPPLY);

      await time.increase(Number(YEAR_SECONDS));
      await bax.claimAnnualUnlock(1);
      expect(await bax.remainingMintable()).to.equal(
        MAX_SUPPLY - GENESIS_SUPPLY - ANNUAL_UNLOCK
      );
    });
  });

  // ── 4. ERC-20 Standard Behaviour ────────────────────────────────────────────
  describe("ERC-20 Transfers", function () {
    it("allows standard transfers with no tax", async function () {
      const { bax, treasury, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");
      await bax.connect(treasury).transfer(alice.address, amount);
      expect(await bax.balanceOf(alice.address)).to.equal(amount);
    });

    it("allows approve + transferFrom with no tax", async function () {
      const { bax, treasury, alice, bob } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("500");
      await bax.connect(treasury).approve(alice.address, amount);
      await bax.connect(alice).transferFrom(treasury.address, bob.address, amount);
      expect(await bax.balanceOf(bob.address)).to.equal(amount);
    });
  });

  // ── 5. Supply Cap Invariant ──────────────────────────────────────────────────
  describe("Supply Cap", function () {
    it("total supply never exceeds MAX_SUPPLY after all unlocks", async function () {
      const { bax } = await loadFixture(deployFixture);
      await time.increase(Number(YEAR_SECONDS) * 4);
      for (let y = 1; y <= 4; y++) {
        await bax.claimAnnualUnlock(y);
      }
      expect(await bax.totalSupply()).to.be.lte(MAX_SUPPLY);
    });
  });
});
