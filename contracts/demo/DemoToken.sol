// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Demo token for the testnet sandbox. Anyone may mint; it is worth nothing on purpose.
contract DemoToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @dev Enough to set a real order, small enough to be obviously not money.
    uint256 public constant FAUCET = 10_000e18;
    mapping(address => uint256) public lastFaucet;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    /// @notice Free tokens so a visitor with nothing can set a real order. One pull per minute.
    function faucet() external {
        require(block.timestamp - lastFaucet[msg.sender] > 60, "wait a minute");
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET);
    }

    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        emit Approval(msg.sender, s, a);
        return true;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        _transfer(msg.sender, to, a);
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        uint256 allowed = allowance[f][msg.sender];
        if (allowed != type(uint256).max) allowance[f][msg.sender] = allowed - a;
        _transfer(f, t, a);
        return true;
    }

    function _transfer(address f, address t, uint256 a) internal {
        balanceOf[f] -= a;
        balanceOf[t] += a;
        emit Transfer(f, t, a);
    }
}
