// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Script, console} from "forge-std/Script.sol";
import {ISafe} from "../src/interfaces/ISafe.sol";

contract SimulateSafe is Script {
    // Safe MultiSend v1.4.1 — CREATE2, same address on all standard EVM chains
    address constant MULTI_SEND = 0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526;

    // Safe contract storage layout:
    // slot 4 = threshold
    // slot 8 = approvedHashes mapping(address => mapping(bytes32 => uint256))
    uint256 constant THRESHOLD_SLOT = 4;
    uint256 constant APPROVED_HASHES_SLOT = 8;

    uint8 constant DELEGATE_CALL = 1;

    function run() external {
        address safeAddress = vm.envAddress("SAFE_ADDRESS");
        bytes memory multiSendCalldata = vm.envBytes("MULTISEND_CALLDATA");

        ISafe safe = ISafe(safeAddress);

        uint256 nonce = safe.nonce();
        address[] memory owners = safe.getOwners();
        require(owners.length > 0, "Safe has no owners");
        address owner = owners[0];

        console.log("Safe: ", safeAddress);
        console.log("Owner:", owner);
        console.log("Nonce:", nonce);

        bytes32 txHash = safe.getTransactionHash(
            MULTI_SEND,
            0,
            multiSendCalldata,
            DELEGATE_CALL,
            0, // safeTxGas
            0, // baseGas
            0, // gasPrice
            address(0), // gasToken
            address(0), // refundReceiver
            nonce
        );

        console.log("Tx hash:", vm.toString(txHash));

        // Override threshold to 1 so only one signature is needed
        vm.store(safeAddress, bytes32(uint256(THRESHOLD_SLOT)), bytes32(uint256(1)));

        // Mark txHash as approved by owner in approvedHashes[owner][txHash]
        bytes32 ownerSlot = keccak256(abi.encode(owner, APPROVED_HASHES_SLOT));
        bytes32 approvedHashSlot = keccak256(abi.encode(txHash, ownerSlot));
        vm.store(safeAddress, approvedHashSlot, bytes32(uint256(1)));

        // Approved-hash signature: r = owner (32 bytes), s = 0 (32 bytes), v = 1 (1 byte)
        bytes memory sig = abi.encodePacked(bytes32(uint256(uint160(owner))), bytes32(0), uint8(1));

        vm.prank(owner);
        bool success = safe.execTransaction(
            MULTI_SEND,
            0,
            multiSendCalldata,
            DELEGATE_CALL,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            sig
        );

        require(success, "Safe execution failed");
        console.log("Simulation succeeded");
    }
}
