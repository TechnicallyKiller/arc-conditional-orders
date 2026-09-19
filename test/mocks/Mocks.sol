// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "../../contracts/interfaces/IERC20.sol";

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

    function swap(address tokenIn, uint256 amountIn) external {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        usdc.transfer(msg.sender, payout);
    }

    receive() external payable {}
}
