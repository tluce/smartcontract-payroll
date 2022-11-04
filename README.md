## Smart Contract Payroll

This project uses Chainlink Automation to allocate payments to recipients at a defined frequency.
The payments are not sent: recipients have to withdraw them.

## Requirements

You need a Chainlink account and some LINK tokens.

## Getting Started

1. Create a `.env` file to set the environment variables from `.env.example`.
2. Run unit tests
```sh
yarn hardhat test
```

If the `REPORT_GAS` environment variable is true, a `gas-report.txt` file is created when you run tests.

3. Deploy the contract
```sh
yarn hardhat deploy --network goerli
```
4. Register a new [Upkeep](https://docs.chain.link/docs/chainlink-automation/register-upkeep/) for the deployed contract in the Chainlink Automation App and select Custom logic trigger.
5. Run staging tests
```sh
yarn hardhat test --network goerli
```

## Usage

The contract must have funds to be useful.

Add a recipient:
```sol
addRecipient(
        address recipient,
        uint256 amount, // wei amount the recipient will be allocated
        uint256 interval // how often in seconds the recipient will be allocated the amount
)
```

Remove a recipient:
```sol
removeRecipient(address recipient)
```

Withdraw the contract funds:
```sol
withdraw()
```

A recipient can withdraw payments:
```sol
withdrawPayments()
```
