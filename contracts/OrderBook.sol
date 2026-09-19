// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CostFloor} from "./CostFloor.sol";
import {V4Price} from "./libraries/V4Price.sol";
import {IPoolManager, PoolId, PoolKey, poolIdOf} from "./interfaces/IPoolManager.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "./ArcGroundTruth.sol";

/// @title OrderBook
/// @notice Non-custodial conditional orders for Arc spot traders.
///
/// Funds stay in the trader's wallet until a fill. The keeper decides WHEN to attempt a fill;
/// this contract decides whether the attempt is valid, by re-reading the pool's own tick.
/// A wrong or malicious keeper can waste its own gas and nothing else.
///
/// Fees are denominated in USDC, which is also what gas is denominated in on Arc. That is what
/// lets `CostFloor` compare them without an oracle.
contract OrderBook is CostFloor {
    using V4Price for IPoolManager;

    enum Status { None, Open, Filled, Cancelled }

    struct Order {
        address owner;
        address tokenIn;
        uint128 amountIn;
        uint128 minAmountOut; // trader's own slippage bound; the contract never picks one
        /// @dev The full key, not just the id. The id is derivable from the key but not the
        ///      reverse, and a keeper that cannot reconstruct the key cannot route the swap.
        ///      Discovered by running the keeper against a pool older than its log lookback.
        PoolKey key;
        int24 triggerTick;
        bool triggerBelow;    // true = fire at or below the tick (stop-loss)
        uint64 expiry;
        Status status;
        // Arming state. A trigger must hold across blocks before it can fill - see armOrder.
        uint64 armedAtBlock;
        int24 armedTick;
    }

    IPoolManager public immutable poolManager;
    /// @dev Proceeds are always USDC: it is the fee unit and the gas unit, which is the only
    ///      reason the cost floor can be stated without a price oracle.
    address public constant TOKEN_OUT = GT.USDC;

    address public owner;
    address public feeRecipient;
    uint16 public feeBps;
    uint256 public marginNative;
    /// @dev Blocks a trigger must remain true before a fill is allowed. At 0.507s blocks this
    ///      is sub-second, but it forces an attacker to HOLD a manipulated price across blocks
    ///      and wear the arbitrage, instead of spiking and reverting inside one transaction.
    uint64 public minDwellBlocks;
    /// @dev An arm older than this is stale and must be redone, so a long-ago observation
    ///      cannot be replayed when price happens to revisit the trigger.
    uint64 public maxArmAgeBlocks;
    mapping(address => bool) public routerAllowed;

    uint256 public nextOrderId = 1;
    mapping(uint256 => Order) public orders;

    uint256 private _locked = 1;

    event OrderCreated(uint256 indexed id, address indexed owner, address tokenIn, uint128 amountIn, int24 triggerTick, bool triggerBelow);
    event OrderCancelled(uint256 indexed id);
    event OrderFilled(uint256 indexed id, address indexed keeper, uint256 amountOut, uint256 fee, uint256 gasCostNative);
    event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock);

    error NotOwner();
    error NotOrderOwner();
    error OrderNotOpen();
    error OrderExpired();
    error TriggerNotMet(int24 currentTick, int24 triggerTick, bool triggerBelow);
    error SlippageExceeded(uint256 amountOut, uint256 minAmountOut);
    error RouterNotAllowed(address router);
    error SwapFailed();
    error Reentrancy();
    error ZeroAmount();
    error NotArmed();
    error DwellNotMet(uint64 armedAtBlock, uint64 currentBlock, uint64 required);
    error ArmStale(uint64 armedAtBlock, uint64 currentBlock);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(
        address _poolManager,
        address _feeRecipient,
        uint16 _feeBps,
        uint256 _marginNative,
        uint256 _settlementGasOverhead,
        uint64 _minDwellBlocks,
        uint64 _maxArmAgeBlocks
    ) CostFloor(_settlementGasOverhead) {
        poolManager = IPoolManager(_poolManager);
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        marginNative = _marginNative;
        minDwellBlocks = _minDwellBlocks;
        maxArmAgeBlocks = _maxArmAgeBlocks;
    }

    /// @dev On Arc an ERC-20 USDC transfer moves NATIVE value, so any contract that can hold
    ///      USDC must accept it or the transfer reverts. Verified on a mainnet fork.
    receive() external payable {}

    // ------------------------------------------------------------------
    // Trader
    // ------------------------------------------------------------------

    function createOrder(
        address tokenIn,
        uint128 amountIn,
        uint128 minAmountOut,
        PoolKey calldata key,
        int24 triggerTick,
        bool triggerBelow,
        uint64 expiry
    ) external returns (uint256 id) {
        if (amountIn == 0) revert ZeroAmount();
        id = nextOrderId++;
        orders[id] = Order({
            owner: msg.sender,
            tokenIn: tokenIn,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            key: key,
            triggerTick: triggerTick,
            triggerBelow: triggerBelow,
            expiry: expiry,
            status: Status.Open,
            armedAtBlock: 0,
            armedTick: 0
        });
        emit OrderCreated(id, msg.sender, tokenIn, amountIn, triggerTick, triggerBelow);
    }

    /// @dev Solidity's auto-generated getter for `orders` omits the nested PoolKey, so a keeper
    ///      reading it would get an order it cannot route. This returns the whole thing.
    function getOrder(uint256 id) external view returns (Order memory) {
        return orders[id];
    }

    function cancelOrder(uint256 id) external {
        Order storage o = orders[id];
        if (o.owner != msg.sender) revert NotOrderOwner();
        if (o.status != Status.Open) revert OrderNotOpen();
        o.status = Status.Cancelled;
        emit OrderCancelled(id);
    }

    // ------------------------------------------------------------------
    // Keeper
    // ------------------------------------------------------------------

    /// @notice Record that an order's trigger is currently true. Permissionless, like execute.
    /// @dev Splitting observation from execution is what defeats single-block price manipulation:
    ///      a spike-and-revert inside one transaction can never satisfy both this and the
    ///      re-check in execute(), because they must land in different blocks.
    function armOrder(uint256 id) external {
        Order storage o = orders[id];
        if (o.status != Status.Open) revert OrderNotOpen();
        if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired();

        int24 tick = poolManager.currentTick(_poolId(o.key));
        _requireTrigger(o, tick);

        o.armedAtBlock = uint64(block.number);
        o.armedTick = tick;
        emit OrderArmed(id, tick, uint64(block.number));
    }

    /// @notice Fill an order. Reverts unless the trigger is genuinely met AND the fee collected
    ///         covers this call's own gas plus margin.
    function execute(uint256 id, address router, bytes calldata routeData)
        external
        nonReentrant
        returns (uint256 amountOut, uint256 fee)
    {
        uint256 gasStart = _startCostAccounting();

        Order storage o = orders[id];
        if (o.status != Status.Open) revert OrderNotOpen();
        if (o.expiry != 0 && block.timestamp > o.expiry) revert OrderExpired();
        if (!routerAllowed[router]) revert RouterNotAllowed(router);

        // The trigger must have been observed in an EARLIER block and still hold now.
        uint64 armed = o.armedAtBlock;
        if (armed == 0) revert NotArmed();
        if (block.number < armed + minDwellBlocks) {
            revert DwellNotMet(armed, uint64(block.number), armed + minDwellBlocks);
        }
        if (block.number > armed + maxArmAgeBlocks) revert ArmStale(armed, uint64(block.number));

        _requireTrigger(o, poolManager.currentTick(_poolId(o.key)));

        // Effects before interactions: the order cannot be filled twice even if a router calls back.
        o.status = Status.Filled;

        uint256 balanceBefore = IERC20(TOKEN_OUT).balanceOf(address(this));

        IERC20(o.tokenIn).transferFrom(o.owner, address(this), o.amountIn);
        IERC20(o.tokenIn).approve(router, o.amountIn);
        (bool ok,) = router.call(routeData);
        if (!ok) revert SwapFailed();
        IERC20(o.tokenIn).approve(router, 0);

        // Measure what actually arrived rather than trusting the router's return value.
        amountOut = IERC20(TOKEN_OUT).balanceOf(address(this)) - balanceBefore;
        if (amountOut < o.minAmountOut) revert SlippageExceeded(amountOut, o.minAmountOut);

        fee = (amountOut * feeBps) / 10_000;

        // Fee is USDC in the 6dp ERC-20 view; gas cost is native 18dp. Scaling here is the
        // single highest-risk line in this contract - see test_feeMustBeScaledBeforeCostFloor.
        uint256 feeNative = fee * GT.NATIVE_PER_ERC20;
        uint256 gasCostNative = _assertCoversCost(gasStart, feeNative, marginNative);

        IERC20(TOKEN_OUT).transfer(o.owner, amountOut - fee);
        if (fee > 0) IERC20(TOKEN_OUT).transfer(feeRecipient, fee);

        emit OrderFilled(id, msg.sender, amountOut, fee, gasCostNative);
    }

    /// @dev poolId = keccak256(abi.encode(PoolKey)), verified against a live Arc pool.
    function _poolId(PoolKey storage k) internal view returns (PoolId) {
        return PoolId.wrap(keccak256(abi.encode(k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks)));
    }

    function _requireTrigger(Order storage o, int24 tick) internal view {
        bool met = o.triggerBelow ? tick <= o.triggerTick : tick >= o.triggerTick;
        if (!met) revert TriggerNotMet(tick, o.triggerTick, o.triggerBelow);
    }

    // ------------------------------------------------------------------
    // Admin. Cannot touch trader funds or fill orders.
    // ------------------------------------------------------------------

    function setRouter(address router, bool allowed) external onlyOwner {
        routerAllowed[router] = allowed;
    }

    function setFee(uint16 _feeBps, address _feeRecipient) external onlyOwner {
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
    }

    function setMargin(uint256 _marginNative) external onlyOwner {
        marginNative = _marginNative;
    }

    function setDwell(uint64 _minDwellBlocks, uint64 _maxArmAgeBlocks) external onlyOwner {
        minDwellBlocks = _minDwellBlocks;
        maxArmAgeBlocks = _maxArmAgeBlocks;
    }
}
