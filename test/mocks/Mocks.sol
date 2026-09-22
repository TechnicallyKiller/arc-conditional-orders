// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../../contracts/interfaces/IERC20.sol";
import {PoolKey} from "../../contracts/interfaces/IPoolManager.sol";

/// @dev A fork cannot mint an arbitrary collateral token to a test account, so tokenIn is mocked.
///      The pool price, the PoolManager and USDC itself are all real on the fork.
contract MockERC20 is IERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
        totalSupply += amt;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        if (allowance[f][msg.sender] != type(uint256).max) allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/// @dev Stands in for a real router in Phase 3. Phase 4 runs the same OrderBook tests against
///      LI.FI and a direct Uniswap V4 swap; if the abstraction is right they pass unchanged.
contract MockRouter {
    IERC20 public immutable usdc;
    uint256 public payout;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function setPayout(uint256 p) external {
        payout = p;
    }

    /// Recorded so a test can assert the OrderBook built the call from the ORDER, not from
    /// anything the caller supplied - that is the whole point of the route-binding fix.
    PoolKey public lastKey;
    bool public lastZeroForOne;
    uint256 public lastAmountIn;
    address public lastRecipient;

    /// @dev Must match OrderBook.ISwapRouter exactly; the book builds this call itself now.
    function swapExactIn(PoolKey calldata key, bool zeroForOne, uint256 amountIn, address recipient)
        external
        returns (uint256)
    {
        lastKey = key;
        lastZeroForOne = zeroForOne;
        lastAmountIn = amountIn;
        lastRecipient = recipient;

        // The book approves tokenIn, so pull that rather than deriving it from the key: these
        // fork tests deliberately pair a real pool key with a mock input token.
        IERC20(tokenInOverride).transferFrom(msg.sender, address(this), amountIn);
        usdc.transfer(recipient, payout);
        return payout;
    }

    address public tokenInOverride;
    function setTokenIn(address t) external { tokenInOverride = t; }

    receive() external payable {}
}
