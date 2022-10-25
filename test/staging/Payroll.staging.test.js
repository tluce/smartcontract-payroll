const { assert } = require("chai");
const { network, ethers } = require("hardhat");
const {
  developmentChains,
  RECIPIENT_1_ADDRESS,
  RECIPIENT_2_ADDRESS,
} = require("../../helper-hardhat-config");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Payroll staging tests", () => {
      let payroll, owner;

      beforeEach(async () => {
        payroll = await ethers.getContract("Payroll");
        owner = (await ethers.getSigners())[0];
      });

      describe("performUpkeep", () => {
        it("works with live Chainlink Automation to pay recipients", async () => {
          // Your Payroll contract must have some ETH (0.01 is enough).
          const contractBalance = await payroll.provider.getBalance(
            payroll.address
          );
          console.log(
            `Payroll contract balance: ${ethers.utils.formatEther(
              contractBalance
            )} ETH`
          );
          assert.isTrue(
            contractBalance.gte(ethers.utils.parseEther("0.01")),
            `The Payroll contract at ${payroll.address} must have at least 0.01 ETH to run the staging tests.`
          );

          // get the recipients' initial balances
          const recipient1InitialBalance = await payroll.provider.getBalance(
            RECIPIENT_1_ADDRESS
          );
          const recipient2InitialBalance = await payroll.provider.getBalance(
            RECIPIENT_2_ADDRESS
          );
          console.log("----------------------");
          console.log("Recipient's initial balances:");
          console.log(
            `${ethers.utils.formatEther(
              recipient1InitialBalance
            )} ETH for ${RECIPIENT_1_ADDRESS}`
          );
          console.log(
            `${ethers.utils.formatEther(
              recipient2InitialBalance
            )} ETH for ${RECIPIENT_2_ADDRESS}`
          );

          // add recipients
          const pay = ethers.utils.parseEther("0.0001");
          console.log("----------------------");
          console.log(`Adding recipient ${RECIPIENT_1_ADDRESS}...`);
          await payroll.addRecipient(RECIPIENT_1_ADDRESS, pay, 15);
          console.log(`Adding recipient ${RECIPIENT_2_ADDRESS}...`);
          await payroll.addRecipient(RECIPIENT_2_ADDRESS, pay, 20);

          await new Promise(async (resolve, reject) => {
            try {
              const transferFilter = payroll.filters.Transfer(
                payroll.address,
                RECIPIENT_2_ADDRESS
              );
              // listen to the second recipient's payment
              payroll.once(transferFilter, async () => {
                // remove recipients
                console.log("----------------------");
                console.log(`Removing recipient ${RECIPIENT_1_ADDRESS}...`);
                await payroll.removeRecipient(RECIPIENT_1_ADDRESS);
                console.log(`Removing recipient ${RECIPIENT_2_ADDRESS}...`);
                await payroll.removeRecipient(RECIPIENT_2_ADDRESS);

                // get the recipients' final balances
                const recipient1FinalBalance =
                  await payroll.provider.getBalance(RECIPIENT_1_ADDRESS);
                const recipient2FinalBalance =
                  await payroll.provider.getBalance(RECIPIENT_2_ADDRESS);
                console.log("----------------------");
                console.log("Recipient's final balances:");
                console.log(
                  `${ethers.utils.formatEther(
                    recipient1FinalBalance
                  )} ETH for ${RECIPIENT_1_ADDRESS}`
                );
                console.log(
                  `${ethers.utils.formatEther(
                    recipient2FinalBalance
                  )} ETH for ${RECIPIENT_2_ADDRESS}`
                );

                assert.isTrue(
                  recipient1FinalBalance.gt(recipient1InitialBalance)
                );
                assert.isTrue(
                  recipient2FinalBalance.gt(recipient2InitialBalance)
                );
                resolve();
              });
            } catch (error) {
              console.log(error);
              reject();
            }
          });
        });
      });
    });
