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

          // get the recipients' initial payment balances
          const recipient1InitialPaymentBalance = await payroll.balanceOf(
            RECIPIENT_1_ADDRESS
          );
          const recipient2InitialPaymentBalance = await payroll.balanceOf(
            RECIPIENT_2_ADDRESS
          );
          console.log("----------------------");
          console.log("Recipients' initial payment balances:");
          console.log(
            `${ethers.utils.formatEther(
              recipient1InitialPaymentBalance
            )} ETH for ${RECIPIENT_1_ADDRESS}`
          );
          console.log(
            `${ethers.utils.formatEther(
              recipient2InitialPaymentBalance
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
            const paymentDoneFilter =
              payroll.filters.PaymentDone(RECIPIENT_2_ADDRESS);
            // listen to the second recipient's payment
            payroll.once(paymentDoneFilter, async () => {
              try {
                // remove recipients
                console.log("----------------------");
                console.log(`Removing recipient ${RECIPIENT_1_ADDRESS}...`);
                await payroll.removeRecipient(RECIPIENT_1_ADDRESS);
                console.log(`Removing recipient ${RECIPIENT_2_ADDRESS}...`);
                await payroll.removeRecipient(RECIPIENT_2_ADDRESS);

                // get the recipients' final payment balances
                const recipient1FinalPaymentBalance = await payroll.balanceOf(
                  RECIPIENT_1_ADDRESS
                );
                const recipient2FinalPaymentBalance = await payroll.balanceOf(
                  RECIPIENT_2_ADDRESS
                );
                console.log("----------------------");
                console.log("Recipients' final payment balances:");
                console.log(
                  `${ethers.utils.formatEther(
                    recipient1FinalPaymentBalance
                  )} ETH for ${RECIPIENT_1_ADDRESS}`
                );
                console.log(
                  `${ethers.utils.formatEther(
                    recipient2FinalPaymentBalance
                  )} ETH for ${RECIPIENT_2_ADDRESS}`
                );

                assert.isTrue(
                  recipient1FinalPaymentBalance.gt(
                    recipient1InitialPaymentBalance
                  )
                );
                assert.isTrue(
                  recipient2FinalPaymentBalance.gt(
                    recipient2InitialPaymentBalance
                  )
                );
                resolve();
              } catch (error) {
                console.log(error);
                reject();
              }
            });
          });
        });
      });
    });
