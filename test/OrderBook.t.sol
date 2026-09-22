// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {OrderBook} from "../contracts/OrderBook.sol";
import {CostFloor} from "../contracts/CostFloor.sol";
import {V4Price} from "../contracts/libraries/V4Price.sol";
import {IPoolManager, PoolId, PoolKey, poolIdOf} from "../contracts/interfaces/IPoolManager.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";
import {ArcGroundTruth as GT} from "../contracts/ArcGroundTruth.sol";
import {MockERC20, MockRouter} from "./mocks/Mocks.sol";

contract OrderBookTest is Test {
    using V4Price for IPoolManager;

    OrderBook book;
    MockERC20 tokenIn;
    MockRouter router;

    address trader = address(0xBEEF);
    address keeper = address(0xCAFE);
    address feeRecipient = address(0xFEE);

    /// Live pool with known key and real liquidity (see V4SwapAdapter.t.sol).
    address constant POOL_TOKEN = 0x70122C10800AE1905092157c21C0Df58802998F2;

    function _key() internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: GT.USDC, currency1: POOL_TOKEN, fee: 30000, tickSpacing: 200, hooks: address(0)
        });
    }

    int24 liveTick;
    uint128 constant AMOUNT_IN = 1_000e18;
    uint256 constant PAYOUT = 1_000e6;
    uint64 constant DWELL = 2;
    uint64 constant MAX_ARM_AGE = 300;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
        // Without this tx.gasprice is 0, the cost floor is trivially satisfied, and every
        // negative test would pass for the wrong reason.
        vm.txGasPrice(21.25 gwei);

        tokenIn = new MockERC20();
        router = new MockRouter(GT.USDC);
        book = new OrderBook(GT.UNIV4_POOL_MANAGER, feeRecipient, 50, 0, 30_000, DWELL, MAX_ARM_AGE, 0, 0);
        book.setRouter(address(router), true);

        liveTick = IPoolManager(GT.UNIV4_POOL_MANAGER).currentTick(poolIdOf(_key()));

        tokenIn.mint(trader, AMOUNT_IN);
        vm.prank(trader);
        tokenIn.approve(address(book), type(uint256).max);

        vm.deal(address(router), PAYOUT * 1e12 * 10);
        router.setPayout(PAYOUT);
        router.setTokenIn(address(tokenIn));
    }

    function _create(int24 triggerTick, bool below, uint128 minOut) internal returns (uint256 id) {
        vm.prank(trader);
        id = book.createOrder(address(tokenIn), AMOUNT_IN, minOut, _key(), triggerTick, below, 0);
    }

    /// Arm the trigger, then advance past the dwell window, as a keeper would across blocks.
    function _armAndWait(uint256 id) internal {
        book.armOrder(id);
        vm.roll(block.number + DWELL);
    }


    // =================================================================
    // Single-block manipulation defence - the reason arming exists
    // =================================================================

    /// THE anti-manipulation assertion. An attacker who spikes the pool through a trigger and
    /// reverts it inside one transaction can never fill, because arming and executing must land
    /// in different blocks. Everything else here is ordinary order-book hygiene; this is the
    /// property that makes the dwell window worth its gas.
    function test_cannotArmAndFillInSameBlock() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        book.armOrder(id);

        vm.expectPartialRevert(OrderBook.DwellNotMet.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_cannotFillWithoutArming() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        vm.expectRevert(OrderBook.NotArmed.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    /// An observation from long ago must not be replayable when price revisits the trigger.
    function test_staleArmIsRejected() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        book.armOrder(id);
        vm.roll(block.number + MAX_ARM_AGE + 1);

        vm.expectPartialRevert(OrderBook.ArmStale.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    /// Arming is permissionless, like execution: safety must not depend on who observes.
    function test_anyoneCanArm() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        vm.prank(address(0xD00D));
        book.armOrder(id);
        vm.roll(block.number + DWELL);
        vm.prank(keeper);
        (uint256 amountOut,) = book.execute(id, address(router));
        assertEq(amountOut, PAYOUT);
    }

    // =================================================================
    // Trigger correctness - now enforced at arm time AND at fill time
    // =================================================================

    function test_cannotArmWhenPriceHasNotFallenToTrigger() public {
        int24 trigger = liveTick - 1000;
        uint256 id = _create(trigger, true, 1);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, true)
        );
        vm.prank(keeper);
        book.armOrder(id);
    }

    function test_cannotArmTakeProfitBelowTrigger() public {
        int24 trigger = liveTick + 1000;
        uint256 id = _create(trigger, false, 1);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TriggerNotMet.selector, liveTick, trigger, false)
        );
        vm.prank(keeper);
        book.armOrder(id);
    }

    // =================================================================
    // Other negative paths
    // =================================================================

    function test_refusesWhenFeeDoesNotCoverGas() public {
        book.setFee(0, feeRecipient);
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.expectPartialRevert(CostFloor.CostFloorBreached.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    /// The bound binds on what the trader RECEIVES, not on gross proceeds. With a 50bp fee a
    /// PAYOUT of 1e9 nets 995e6, so an order asking for PAYOUT + 1 must refuse - and the error
    /// must report the net figure, or the trader cannot tell how far short the fill fell.
    function test_refusesWhenSlippageExceeded() public {
        uint256 id = _create(liveTick + 1000, true, uint128(PAYOUT + 1));
        _armAndWait(id);
        uint256 expectedNet = PAYOUT - (PAYOUT * 50) / 10_000;
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.SlippageExceeded.selector, expectedNet, PAYOUT + 1)
        );
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    /// A fill that clears the bound GROSS but not NET must refuse. Before the fee was moved
    /// ahead of the check, this order filled and paid the trader less than they signed for.
    function test_slippageBindsOnNetNotGross() public {
        uint256 id = _create(liveTick + 1000, true, uint128(PAYOUT));
        _armAndWait(id);
        vm.expectPartialRevert(OrderBook.SlippageExceeded.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_refusesUnapprovedRouter() public {
        MockRouter rogue = new MockRouter(GT.USDC);
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.expectRevert(abi.encodeWithSelector(OrderBook.RouterNotAllowed.selector, address(rogue)));
        vm.prank(keeper);
        book.execute(id, address(rogue));
    }

    function test_cannotFillTwice() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.prank(keeper);
        book.execute(id, address(router));

        vm.expectRevert(OrderBook.OrderNotOpen.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_cancelledOrderCannotFill() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.prank(trader);
        book.cancelOrder(id);
        vm.expectRevert(OrderBook.OrderNotOpen.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_onlyOwnerCanCancel() public {
        uint256 id = _create(liveTick - 1000, true, 1);
        vm.expectRevert(OrderBook.NotOrderOwner.selector);
        vm.prank(keeper);
        book.cancelOrder(id);
    }

    function test_expiredOrderCannotFill() public {
        vm.prank(trader);
        uint256 id = book.createOrder(
            address(tokenIn), AMOUNT_IN, 1, _key(), liveTick + 1000, true, uint64(block.timestamp + 100)
        );
        book.armOrder(id);
        vm.roll(block.number + DWELL);
        vm.warp(block.timestamp + 200);
        vm.expectRevert(OrderBook.OrderExpired.selector);
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    // =================================================================
    // Positive path
    // =================================================================

    function test_fillsWhenPriceReachesTrigger() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);

        uint256 traderBefore = IERC20(GT.USDC).balanceOf(trader);

        vm.prank(keeper);
        (uint256 amountOut, uint256 fee) = book.execute(id, address(router));

        assertEq(amountOut, PAYOUT, "wrong amount out");
        assertEq(fee, (PAYOUT * 50) / 10_000, "wrong fee");
        assertEq(IERC20(GT.USDC).balanceOf(trader) - traderBefore, PAYOUT - fee, "trader underpaid");
        assertEq(IERC20(GT.USDC).balanceOf(feeRecipient), fee, "fee not collected");
        assertEq(tokenIn.balanceOf(trader), 0, "tokenIn not taken");
    }

    /// The decimal boundary, in the place it actually bites. Fee is a 6dp ERC-20 amount and gas
    /// cost is native 18dp; comparing them unscaled is wrong by 1e12, and unscaled this fee
    /// would look ~1000x SMALLER than the gas cost, so the fill would wrongly revert.
    function test_feeMustBeScaledBeforeCostFloor() public pure {
        uint256 fee = (PAYOUT * 50) / 10_000;
        uint256 feeNative = fee * GT.NATIVE_PER_ERC20;
        uint256 typicalGasCost = 300_000 * 21.25 gwei;
        assertLt(fee, typicalGasCost, "unscaled fee looks smaller than gas - the trap");
        assertGt(feeNative, typicalGasCost, "scaled fee must clear gas cost");
    }

    // =================================================================
    // Exposure caps - the mainnet safety rail
    // =================================================================

    /// A cap enforced only in the UI is a suggestion. This one is readable on-chain.
    function test_perOrderCapBlocksAnOversizedFill() public {
        book.setCaps(PAYOUT - 1, 0); // cap just below what this fill would deliver
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.OrderValueCapped.selector, PAYOUT, PAYOUT - 1)
        );
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_totalCapBlocksCumulativeExposure() public {
        book.setCaps(0, PAYOUT - 1);
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.expectRevert(
            abi.encodeWithSelector(OrderBook.TotalValueCapped.selector, PAYOUT, PAYOUT - 1)
        );
        vm.prank(keeper);
        book.execute(id, address(router));
    }

    function test_totalFilledAccumulates() public {
        book.setCaps(0, 0); // uncapped
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);
        vm.prank(keeper);
        book.execute(id, address(router));
        assertEq(book.totalFilledUsdc(), PAYOUT, "total not tracked");
    }

    function test_zeroMeansUnlimited() public view {
        assertEq(book.maxOrderValueUsdc(), 0);
        assertEq(book.maxTotalValueUsdc(), 0);
    }

    function test_onlyOwnerCanSetCaps() public {
        vm.expectRevert(OrderBook.NotOwner.selector);
        vm.prank(keeper);
        book.setCaps(1, 1);
    }

    // =================================================================
    // checkOrders - the keeper's view, and why PoolUnreadable is separate
    // =================================================================

    function _ids(uint256 a) internal pure returns (uint256[] memory out) {
        out = new uint256[](1);
        out[0] = a;
    }

    function test_checkOrdersReportsNotTriggered() public {
        uint256 id = _create(liveTick - 1000, true, 1);
        (OrderBook.TriggerState[] memory st, int24[] memory tk) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.NotTriggered));
        assertEq(tk[0], liveTick, "tick should still be reported");
    }

    function test_checkOrdersReportsTriggeredThenArmingThenReady() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        (OrderBook.TriggerState[] memory st,) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.Triggered));

        book.armOrder(id);
        (st,) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.Arming));

        vm.roll(block.number + DWELL);
        (st,) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.Ready));
    }

    /// THE point of the enum. An unreadable pool must NOT look like "not triggered", or a
    /// keeper silently does nothing while the user believes they are protected.
    function test_unreadablePoolIsDistinctFromNotTriggered() public {
        PoolKey memory dead = PoolKey({
            currency0: GT.USDC, currency1: address(0xDEAD), fee: 3000, tickSpacing: 60, hooks: address(0)
        });
        vm.prank(trader);
        uint256 id = book.createOrder(address(tokenIn), AMOUNT_IN, 1, dead, 0, true, 0);

        (OrderBook.TriggerState[] memory st,) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.PoolUnreadable), "must be distinguishable");
        assertTrue(
            st[0] != OrderBook.TriggerState.NotTriggered,
            "an unreadable pool reported as not-triggered is a silent failure"
        );
    }

    function test_checkOrdersReportsCancelledAndExpired() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        vm.prank(trader);
        book.cancelOrder(id);
        (OrderBook.TriggerState[] memory st,) = book.checkOrders(_ids(id));
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.NotOpen));
    }

    /// Every order in one call means every order is evaluated against the same block.
    function test_checkOrdersBatches() public {
        uint256 a = _create(liveTick + 1000, true, 1);
        uint256 b = _create(liveTick - 1000, true, 1);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        (OrderBook.TriggerState[] memory st,) = book.checkOrders(ids);
        assertEq(uint8(st[0]), uint8(OrderBook.TriggerState.Triggered));
        assertEq(uint8(st[1]), uint8(OrderBook.TriggerState.NotTriggered));
    }

    // =================================================================
    // Regressions for the audit findings. Each one FAILED before its fix.
    // =================================================================

    /// FINDING 2. armOrder is permissionless and used to overwrite armedAtBlock on every call,
    /// so anyone could push the dwell deadline forward every block and keep an order
    /// permanently unfillable - during exactly the price move the stop-loss exists for.
    function test_reArmingCannotResetTheDwellClock() public {
        address griefer = address(0xBAD);
        uint256 id = _create(liveTick + 1000, true, 1);

        book.armOrder(id);
        uint64 armedAt = uint64(block.number);

        // The griefer re-arms in every block of the dwell window.
        for (uint256 i = 0; i < DWELL; i++) {
            vm.roll(block.number + 1);
            vm.prank(griefer);
            book.armOrder(id);
        }

        assertEq(book.getOrder(id).armedAtBlock, armedAt, "re-arm moved the dwell clock");

        // The original observation still governs, so the fill lands on schedule.
        vm.prank(keeper);
        book.execute(id, address(router));
        assertEq(uint8(book.getOrder(id).status), uint8(OrderBook.Status.Filled));
    }

    /// A genuinely stale arm must still be replaceable, or an order that went un-filled could
    /// never be re-armed.
    function test_staleArmCanStillBeReplaced() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        book.armOrder(id);
        uint64 first = book.getOrder(id).armedAtBlock;

        vm.roll(block.number + MAX_ARM_AGE + 1);
        book.armOrder(id);

        assertGt(book.getOrder(id).armedAtBlock, first, "stale arm was not replaced");
    }

    /// FINDING 1. execute used to forward caller-authored calldata, so the pool whose tick
    /// authorised the fill was not necessarily the pool the fill traded in, and the proceeds
    /// recipient was whatever the caller named. The call is now built from the order.
    function test_routeIsBuiltFromTheOrderNotTheCaller() public {
        uint256 id = _create(liveTick + 1000, true, 1);
        _armAndWait(id);

        vm.prank(keeper);
        book.execute(id, address(router));

        assertEq(router.lastRecipient(), address(book), "proceeds must land on the book");
        assertEq(router.lastAmountIn(), AMOUNT_IN, "amount must come from the order");

        (address c0, address c1, uint24 f, int24 ts, address h) = router.lastKey();
        PoolKey memory k = _key();
        assertEq(c0, k.currency0, "currency0 not from the order");
        assertEq(c1, k.currency1, "currency1 not from the order");
        assertEq(f, k.fee, "fee not from the order");
        assertEq(ts, k.tickSpacing, "tickSpacing not from the order");
        assertEq(h, k.hooks, "hooks not from the order");
    }

    /// FINDING 5. balanceBefore was sampled before the input was pulled in, so an order whose
    /// input IS the proceeds token scored its own principal as swap output.
    function test_rejectsOrderWhoseInputIsTheProceedsToken() public {
        vm.prank(trader);
        vm.expectRevert(OrderBook.TokenInIsProceeds.selector);
        book.createOrder(GT.USDC, AMOUNT_IN, 1, _key(), liveTick + 1000, true, 0);
    }

    /// FINDING 3. The shipped frontend passed 0 for every order, so the one protection the
    /// contract relies on was absent in practice.
    function test_rejectsZeroSlippageBound() public {
        vm.prank(trader);
        vm.expectRevert(OrderBook.ZeroMinAmountOut.selector);
        book.createOrder(address(tokenIn), AMOUNT_IN, 0, _key(), liveTick + 1000, true, 0);
    }

    /// FINDING 8. feeBps applies at fill time, so a raise reaches orders already signed.
    function test_feeCannotExceedCeiling() public {
        uint16 max = book.MAX_FEE_BPS();
        vm.expectRevert(abi.encodeWithSelector(OrderBook.FeeTooHigh.selector, uint16(10_000), max));
        book.setFee(10_000, feeRecipient);

        book.setFee(max, feeRecipient);
        assertEq(book.feeBps(), max, "ceiling itself must be settable");
    }
}
