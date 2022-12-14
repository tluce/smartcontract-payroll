// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";

// Errors
error Payroll__InvalidPaymentData(
    address recipient,
    uint256 amount,
    uint256 interval
);
error Payroll__RecipientAlreadyExists(address recipient);
error Payroll__WithdrawalFailed();
error Payroll__PaymentWithdrawalFailed();

/// @title A smart contract payroll
/// @dev It uses Chainlink Automation to allocate payments to recipients.
/// They can withdraw their payments.
contract Payroll is Ownable, AutomationCompatibleInterface {
    struct PaymentSchedule {
        uint256 amount;
        uint256 interval; // seconds
        uint256 lastTimestamp; // seconds
    }

    address[] private s_recipients;
    mapping(address => PaymentSchedule) private s_paymentSchedules;
    mapping(address => uint256) private s_balances;

    // Events
    event RecipientAdded(
        address indexed recipient,
        uint256 indexed amount,
        uint256 indexed interval
    );
    event RecipientRemoved(address indexed recipient);
    event Transfer(
        address indexed from,
        address indexed to,
        uint256 indexed amount
    );
    event PaymentDone(address indexed recipient, uint256 indexed amount);
    event InsufficientBalance(
        address indexed recipient,
        uint256 indexed requiredAmount,
        uint256 indexed contractBalance
    );

    /// Add funds to the contract.
    receive() external payable {}

    /// Add a recipient.
    /// @param recipient the address of the recipient
    /// @param amount the wei amount the recipient will be allocated
    /// @param interval how often in seconds the recipient will be allocated the amount
    /// @dev stores the recipient in `s_recipients` and the PaymentSchedule in `s_paymentSchedules`
    function addRecipient(
        address recipient,
        uint256 amount,
        uint256 interval
    ) public onlyOwner {
        if (amount == 0 || interval == 0) {
            revert Payroll__InvalidPaymentData(recipient, amount, interval);
        }
        if (s_paymentSchedules[recipient].amount > 0) {
            revert Payroll__RecipientAlreadyExists(recipient);
        }
        PaymentSchedule memory paymentSchedule = PaymentSchedule(
            amount,
            interval,
            block.timestamp
        );
        s_recipients.push(recipient);
        s_paymentSchedules[recipient] = paymentSchedule;
        emit RecipientAdded(recipient, amount, interval);
    }

    /// Remove a recipient.
    /// @param recipient the address of the recipient to remove
    /// @dev removes the recipient from `s_recipients` by shifting the array
    /// and from `s_recipientsPayments` by deleting the recipient
    function removeRecipient(address recipient) public onlyOwner {
        for (uint256 i = 0; i < s_recipients.length; ++i) {
            // find the recipient's index
            if (s_recipients[i] == recipient) {
                if (i < s_recipients.length - 1) {
                    // shift the array's elements
                    for (uint256 j = i; j < s_recipients.length - 1; ++j) {
                        s_recipients[j] = s_recipients[j + 1];
                    }
                }
                s_recipients.pop();
                delete s_paymentSchedules[recipient];
                emit RecipientRemoved(recipient);
                break;
            }
        }
    }

    /// Withdraw the contract funds.
    function withdraw() public onlyOwner {
        (bool success, ) = payable(msg.sender).call{
            value: address(this).balance
        }("");
        if (!success) {
            revert Payroll__WithdrawalFailed();
        }
    }

    /// Withdraw a recipient's payments.
    function withdrawPayments() public {
        if (s_balances[msg.sender] > 0) {
            if (s_balances[msg.sender] > address(this).balance) {
                emit InsufficientBalance(
                    msg.sender,
                    s_balances[msg.sender],
                    address(this).balance
                );
            } else {
                uint256 recipientBalance = s_balances[msg.sender];
                s_balances[msg.sender] = 0;
                (bool success, ) = payable(msg.sender).call{
                    value: recipientBalance
                }("");
                if (success) {
                    emit Transfer(address(this), msg.sender, recipientBalance);
                } else {
                    s_balances[msg.sender] = recipientBalance;
                    revert Payroll__PaymentWithdrawalFailed();
                }
            }
        }
    }

    /// Check if a payment is due.
    /// @param `paymentSchedule` the payment schedule to check
    /// @return true if a payment is due
    function paymentDue(PaymentSchedule memory paymentSchedule)
        private
        view
        returns (bool)
    {
        return (paymentSchedule.amount > 0 &&
            paymentSchedule.interval > 0 &&
            block.timestamp - paymentSchedule.lastTimestamp >
            paymentSchedule.interval);
    }

    /// @dev This function is called off-chain by Chainlink Automation nodes.
    /// `upkeepNeeded` must be true when a payment is due for at least one recipient
    /// @return upkeepNeeded boolean to indicate if performUpkeep should be called
    /// @return performData the recipients for which a payment is due
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        address[] memory recipientsToPay = new address[](s_recipients.length);
        upkeepNeeded = false;
        uint256 recipientToPayIndex = 0;

        // check the payment interval of each recipient
        PaymentSchedule memory paymentSchedule;
        for (uint256 i = 0; i < s_recipients.length; ++i) {
            paymentSchedule = s_paymentSchedules[s_recipients[i]];
            if (paymentDue(paymentSchedule)) {
                recipientsToPay[recipientToPayIndex] = s_recipients[i];
                ++recipientToPayIndex;
                upkeepNeeded = true;
            }
        }

        if (recipientToPayIndex > 0) {
            // copy the recipients to pay
            address[] memory performDataToEncode = new address[](
                recipientToPayIndex
            );
            for (uint256 i = 0; i < performDataToEncode.length; ++i) {
                performDataToEncode[i] = recipientsToPay[i];
            }
            performData = abi.encode(performDataToEncode);
        } else {
            address[] memory performDataToEncode;
            performData = abi.encode(performDataToEncode);
        }

        return (upkeepNeeded, performData);
    }

    /// @dev This function is called on-chain when `upkeepNeeded` is true.
    /// @param performData the recipients for which a payment is due
    function performUpkeep(bytes calldata performData) external override {
        address[] memory recipientsToPay = abi.decode(performData, (address[]));
        PaymentSchedule memory paymentSchedule;
        for (uint256 i = 0; i < recipientsToPay.length; ++i) {
            paymentSchedule = s_paymentSchedules[recipientsToPay[i]];
            if (paymentDue(paymentSchedule)) {
                // update the recipient's timestamp and balance
                paymentSchedule.lastTimestamp = block.timestamp;
                s_paymentSchedules[recipientsToPay[i]] = paymentSchedule;
                s_balances[recipientsToPay[i]] += paymentSchedule.amount;
                emit PaymentDone(recipientsToPay[i], paymentSchedule.amount);
            }
        }
    }

    /// Return a recipient's payment schedule.
    /// @param recipient the address of the recipient
    /// @dev retrieves the recipient's PaymentSchedule from `s_paymentSchedules`
    /// @return the recipient's PaymentSchedule
    function getPaymentSchedule(address recipient)
        public
        view
        returns (PaymentSchedule memory)
    {
        return s_paymentSchedules[recipient];
    }

    /// Return the recipients.
    /// @return the recipients
    function getRecipients() public view returns (address[] memory) {
        return s_recipients;
    }

    /// Return a recipient's payment balance.
    /// @return the payment balance of a recipient
    function balanceOf(address recipient) public view returns (uint256) {
        return s_balances[recipient];
    }
}
