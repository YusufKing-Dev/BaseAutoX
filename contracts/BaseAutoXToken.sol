// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title BAX - BaseAutoX Token
 * @notice Fixed-supply ERC-20 token on Base network with phased release schedule.
 * @dev Immutable after deployment. No minting beyond schedule. No taxes. No blacklists.
 *
 * Supply Schedule:
 *   Initial Genesis Supply : 15.00%  —  64,500,000 BAX  (minted at deploy)
 *   Year 1 Unlock          : 21.25%  —  91,375,000 BAX  (claimable after 365 days)
 *   Year 2 Unlock          : 21.25%  —  91,375,000 BAX  (claimable after 730 days)
 *   Year 3 Unlock          : 21.25%  —  91,375,000 BAX  (claimable after 1095 days)
 *   Year 4 Unlock          : 21.25%  —  91,375,000 BAX  (claimable after 1460 days)
 *   ─────────────────────────────────────────────────────
 *   Total Maximum Supply   : 100.00% — 430,000,000 BAX
 */
contract BaseAutoXToken is ERC20 {
    // ─── Constants ───────────────────────────────────────────────────────────

    uint256 public constant MAX_SUPPLY         = 430_000_000e18;
    uint256 public constant GENESIS_SUPPLY     =  64_500_000e18; // 15%
    uint256 public constant ANNUAL_UNLOCK      =  91_375_000e18; // 21.25% × 4

    uint256 public constant UNLOCK_INTERVAL    = 365 days;
    uint256 public constant TOTAL_UNLOCK_YEARS = 4;

    // ─── Immutable state ─────────────────────────────────────────────────────

    /// @notice Address that receives all unlocked tokens (set at deployment, never changed).
    address public immutable treasury;

    /// @notice Unix timestamp of contract deployment.
    uint256 public immutable deployedAt;

    // ─── Mutable state ───────────────────────────────────────────────────────

    /// @notice Tracks which annual unlock epochs (1–4) have been claimed.
    mapping(uint256 => bool) public unlockClaimed;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AnnualUnlockClaimed(uint256 indexed year, uint256 amount, uint256 timestamp);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param _treasury Address to receive genesis supply and all future unlocks.
     */
    constructor(address _treasury) ERC20("BaseAutoX", "BAX") {
        require(_treasury != address(0), "BAX: treasury is zero address");

        treasury   = _treasury;
        deployedAt = block.timestamp;

        // Mint genesis supply immediately.
        _mint(_treasury, GENESIS_SUPPLY);
    }

    // ─── Public functions ────────────────────────────────────────────────────

    /**
     * @notice Claims the annual unlock for the given year (1–4).
     * @dev Anyone may call this once the unlock window is open; tokens always go to treasury.
     * @param year The unlock year to claim (1, 2, 3, or 4).
     */
    function claimAnnualUnlock(uint256 year) external {
        require(year >= 1 && year <= TOTAL_UNLOCK_YEARS, "BAX: invalid year");
        require(!unlockClaimed[year], "BAX: already claimed");
        require(
            block.timestamp >= deployedAt + (year * UNLOCK_INTERVAL),
            "BAX: unlock not yet available"
        );

        unlockClaimed[year] = true;
        _mint(treasury, ANNUAL_UNLOCK);

        emit AnnualUnlockClaimed(year, ANNUAL_UNLOCK, block.timestamp);
    }

    // ─── View helpers ────────────────────────────────────────────────────────

    /**
     * @notice Returns the Unix timestamp when a given unlock year becomes claimable.
     */
    function unlockTimestamp(uint256 year) external view returns (uint256) {
        require(year >= 1 && year <= TOTAL_UNLOCK_YEARS, "BAX: invalid year");
        return deployedAt + (year * UNLOCK_INTERVAL);
    }

    /**
     * @notice Returns the number of annual unlock epochs that have been claimed so far.
     */
    function claimedUnlocks() external view returns (uint256 count) {
        for (uint256 i = 1; i <= TOTAL_UNLOCK_YEARS; i++) {
            if (unlockClaimed[i]) count++;
        }
    }

    /**
     * @notice Returns the number of BAX tokens not yet minted.
     */
    function remainingMintable() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    // ─── ERC-20 overrides ────────────────────────────────────────────────────

    /**
     * @dev Hard cap: total supply can never exceed MAX_SUPPLY.
     *      This is enforced by the fixed schedule above but added as a safety invariant.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        super._update(from, to, value);
        // Invariant: minting never exceeds hard cap.
        if (from == address(0)) {
            require(totalSupply() <= MAX_SUPPLY, "BAX: exceeds max supply");
        }
    }
}
