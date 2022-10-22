const { assert, expect } = require("chai");
const { network, deployments, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Payroll unit tests", () => {
      let payroll, accounts, owner, recipientAccount;
      const ownableErrorMessage = "Ownable: caller is not the owner";

      const fundContract = async (ethAmount) => {
        const amount = ethers.utils.parseEther(ethAmount);
        let txResponse = await owner.sendTransaction({
          to: payroll.address,
          value: amount,
        });
        await txResponse.wait();
      };

      beforeEach(async () => {
        await deployments.fixture(["payroll"]);
        payroll = await ethers.getContract("Payroll");
        accounts = await ethers.getSigners();
        owner = accounts[0];
        recipientAccount = accounts[1];
      });

      describe("constructor", () => {
        it("the contract is initialized correctly", async () => {
          const payrollRecipients = await payroll.getRecipients();
          assert.equal(payrollRecipients.length, 0);
        });
      });

      describe("addRecipient", () => {
        it("only the owner can add a recipient", async () => {
          const attackerAccount = accounts[2];
          const connectedPayroll = payroll.connect(attackerAccount);
          await expect(
            connectedPayroll.addRecipient(recipientAccount.address, 10, 20)
          ).to.be.revertedWith(ownableErrorMessage);
        });

        it("the amount must not be zero", async () => {
          await expect(
            payroll.addRecipient(recipientAccount.address, 0, 10)
          ).to.be.revertedWith("Payroll__InvalidPaymentData");
        });

        it("the payment interval must not be zero", async () => {
          await expect(
            payroll.addRecipient(recipientAccount.address, 50, 0)
          ).to.be.revertedWith("Payroll__InvalidPaymentData");
        });

        it("a recipient can't be added twice", async () => {
          await payroll.addRecipient(recipientAccount.address, 10, 20);
          await expect(
            payroll.addRecipient(recipientAccount.address, 20, 30)
          ).to.be.revertedWith("Payroll__RecipientAlreadyExists");
        });

        it("stores an added recipient and emits a RecipientAdded event", async () => {
          const amount = 20;
          const interval = 30;
          const txResponse = await payroll.addRecipient(
            recipientAccount.address,
            amount,
            interval
          );
          const txReceipt = await txResponse.wait(1);
          assert.equal(txReceipt.events[0].event, "RecipientAdded");
          assert.equal(
            txReceipt.events[0].args.recipient,
            recipientAccount.address
          );
          assert.equal(txReceipt.events[0].args.amount, amount);
          assert.equal(txReceipt.events[0].args.interval, interval);

          const paymentSchedule = await payroll.getPaymentSchedule(
            recipientAccount.address
          );
          assert.equal(paymentSchedule.amount, 20);
          assert.equal(paymentSchedule.interval, 30);
        });
      });

      describe("removeRecipient", () => {
        it("removes a recipient and emits a RecipientRemoved event", async () => {
          await payroll.addRecipient(recipientAccount.address, 10, 20);
          assert.equal((await payroll.getRecipients()).length, 1);
          const txResponse = await payroll.removeRecipient(
            recipientAccount.address
          );
          const txReceipt = await txResponse.wait(1);
          assert.equal(txReceipt.events[0].event, "RecipientRemoved");
          assert.equal(
            txReceipt.events[0].args.recipient,
            recipientAccount.address
          );
          assert.equal((await payroll.getRecipients()).length, 0);

          const paymentSchedule = await payroll.getPaymentSchedule(
            recipientAccount.address
          );
          assert.equal(paymentSchedule.amount, 0);
          assert.equal(paymentSchedule.interval, 0);
          assert.equal(paymentSchedule.lastTimestamp, 0);
        });
      });

      describe("withdraw", () => {
        it("only the owner can withdraw", async () => {
          const attackerAccount = accounts[2];
          const connectedPayroll = payroll.connect(attackerAccount);
          await expect(connectedPayroll.withdraw()).to.be.revertedWith(
            ownableErrorMessage
          );
        });

        it("sends the contract funds to the owner", async () => {
          await fundContract("1");

          // get initial balances
          const contractInitialBalance = await payroll.provider.getBalance(
            payroll.address
          );
          const ownerInitialBalance = await payroll.provider.getBalance(
            owner.address
          );

          // withdraw
          txResponse = await payroll.withdraw();

          // get the gas cost
          const { gasUsed, effectiveGasPrice } = await txResponse.wait();
          const gasCost = gasUsed.mul(effectiveGasPrice);

          // get the final balances
          const contractFinalBalance = await payroll.provider.getBalance(
            payroll.address
          );
          const ownerFinalBalance = await payroll.provider.getBalance(
            owner.address
          );

          // asserts
          assert.equal(contractFinalBalance, 0);
          assert.equal(
            ownerFinalBalance.toString(),
            ownerInitialBalance
              .add(contractInitialBalance)
              .sub(gasCost)
              .toString()
          );
        });
      });

      describe("checkUpkeep", () => {
        it("returns true when enough time has passed for at leat one recipient and returns eligible recipients", async () => {
          const interval = 30;
          await payroll.addRecipient(recipientAccount.address, 10, interval);
          await payroll.addRecipient(accounts[2].address, 10, 5000);
          await network.provider.send("evm_increaseTime", [interval + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });

          const { upkeepNeeded, performData } =
            await payroll.callStatic.checkUpkeep([]);
          const eligibleRecipients = ethers.utils.defaultAbiCoder.decode(
            ["address[]"],
            performData
          )[0];

          assert.isTrue(upkeepNeeded);
          assert.equal(eligibleRecipients.length, 1);
          assert.equal(eligibleRecipients[0], recipientAccount.address);
        });

        it("returns false and an empty array when no payment is due", async () => {
          let { upkeepNeeded, performData } =
            await payroll.callStatic.checkUpkeep([]);
          let eligibleRecipients = ethers.utils.defaultAbiCoder.decode(
            ["address[]"],
            performData
          )[0];
          assert.isFalse(upkeepNeeded);
          assert.equal(eligibleRecipients.length, 0);

          await payroll.addRecipient(accounts[2].address, 10, 5000);
          await payroll.addRecipient(accounts[3].address, 10, 6000);
          await network.provider.send("evm_increaseTime", [30]);
          await network.provider.request({ method: "evm_mine", params: [] });
          [upkeepNeeded, performData] = await payroll.callStatic.checkUpkeep(
            []
          );
          eligibleRecipients = ethers.utils.defaultAbiCoder.decode(
            ["address[]"],
            performData
          )[0];
          assert.isFalse(upkeepNeeded);
          assert.equal(eligibleRecipients.length, 0);
        });
      });

      describe("performUpkeep", () => {
        it("doesn't update lastTimestamp if no payment is due", async () => {
          await payroll.addRecipient(recipientAccount.address, 10, 5000);
          const initialLastTimestamp = (
            await payroll.getPaymentSchedule(recipientAccount.address)
          ).lastTimestamp;
          await network.provider.send("evm_increaseTime", [30]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await payroll.performUpkeep(
            ethers.utils.defaultAbiCoder.encode(
              ["address[]"],
              [[recipientAccount.address]]
            )
          );

          assert.equal(
            initialLastTimestamp.toString(),
            (
              await payroll.getPaymentSchedule(recipientAccount.address)
            ).lastTimestamp.toString()
          );
        });

        it("emits InsufficientBalance when a recipient requests too much and pays the eligible recipients left", async () => {
          await fundContract("1");
          const interval = 30;
          const largeAmount = ethers.utils.parseEther("2");
          await payroll.addRecipient(
            recipientAccount.address,
            largeAmount,
            interval
          );
          const smallAmount = ethers.utils.parseEther("0.1");
          await payroll.addRecipient(
            accounts[2].address,
            smallAmount,
            interval
          );
          const recipient1InitialBalance = await payroll.provider.getBalance(
            recipientAccount.address
          );
          const recipient2InitialBalance = await payroll.provider.getBalance(
            accounts[2].address
          );
          await network.provider.send("evm_increaseTime", [interval + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
          [upkeepNeeded, performData] = await payroll.checkUpkeep([]);
          const txResponse = await payroll.performUpkeep(performData);
          const txReceipt = await txResponse.wait(1);

          assert.equal(txReceipt.events[0].event, "InsufficientBalance");
          assert.equal(
            txReceipt.events[0].args.recipient,
            recipientAccount.address
          );
          assert.equal(
            txReceipt.events[0].args.requiredAmount.toString(),
            largeAmount.toString()
          );
          assert.equal(
            txReceipt.events[0].args.balance.toString(),
            ethers.utils.parseEther("1").toString()
          );
          assert.equal(
            (
              await payroll.provider.getBalance(recipientAccount.address)
            ).toString(),
            recipient1InitialBalance.toString()
          );
          assert.equal(
            (await payroll.provider.getBalance(accounts[2].address)).toString(),
            recipient2InitialBalance.add(smallAmount).toString()
          );
        });

        it("emits a Transfer event when a payment is made", async () => {
          await fundContract("1");
          const amount = ethers.utils.parseEther("0.5");
          const interval = 30;
          await payroll.addRecipient(
            recipientAccount.address,
            amount,
            interval
          );
          await network.provider.send("evm_increaseTime", [interval + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
          [upkeepNeeded, performData] = await payroll.checkUpkeep([]);
          const txResponse = await payroll.performUpkeep(performData);
          const txReceipt = await txResponse.wait(1);

          assert.equal(txReceipt.events[0].event, "Transfer");
          assert.equal(txReceipt.events[0].args.from, payroll.address);
          assert.equal(
            txReceipt.events[0].args.amount.toString(),
            amount.toString()
          );
        });

        it("pays a recipient as long as a payment is due", async () => {
          await fundContract("1");
          const recipientInitialBalance = await payroll.provider.getBalance(
            recipientAccount.address
          );
          const amount = ethers.utils.parseEther("0.1");
          const interval = 30;
          await payroll.addRecipient(
            recipientAccount.address,
            amount,
            interval
          );
          const nbOfPayments = 7;
          for (let i = 0; i < nbOfPayments; i++) {
            await network.provider.send("evm_increaseTime", [interval + 1]);
            await network.provider.request({ method: "evm_mine", params: [] });
            [upkeepNeeded, performData] = await payroll.checkUpkeep([]);
            await payroll.performUpkeep(performData);
          }

          assert.equal(
            (
              await payroll.provider.getBalance(recipientAccount.address)
            ).toString(),
            recipientInitialBalance.add(amount.mul(nbOfPayments)).toString()
          );
        });

        it("pays multiple recipients if multiple payments are due", async () => {
          await fundContract("1");
          const interval = 30;
          const amount1 = ethers.utils.parseEther("0.1");
          const amount2 = ethers.utils.parseEther("0.2");
          const amount3 = ethers.utils.parseEther("0.3");
          const amount4 = ethers.utils.parseEther("0.4");
          const initialBalance1 = await payroll.provider.getBalance(
            recipientAccount.address
          );
          const initialBalance2 = await payroll.provider.getBalance(
            accounts[2].address
          );
          const initialBalance3 = await payroll.provider.getBalance(
            accounts[3].address
          );
          const initialBalance4 = await payroll.provider.getBalance(
            accounts[4].address
          );
          await payroll.addRecipient(
            recipientAccount.address,
            amount1,
            interval - 5
          );
          await payroll.addRecipient(
            accounts[2].address,
            amount2,
            interval - 3
          );
          await payroll.addRecipient(accounts[3].address, amount3, interval);
          await payroll.addRecipient(
            accounts[4].address,
            amount4,
            interval + 5
          );
          await network.provider.send("evm_increaseTime", [interval + 1]);
          await network.provider.request({ method: "evm_mine", params: [] });
          [upkeepNeeded, performData] = await payroll.checkUpkeep([]);
          await payroll.performUpkeep(performData);

          assert.equal(
            (
              await payroll.provider.getBalance(recipientAccount.address)
            ).toString(),
            initialBalance1.add(amount1).toString()
          );
          assert.equal(
            (await payroll.provider.getBalance(accounts[2].address)).toString(),
            initialBalance2.add(amount2).toString()
          );
          assert.equal(
            (await payroll.provider.getBalance(accounts[3].address)).toString(),
            initialBalance3.add(amount3).toString()
          );
          assert.equal(
            (await payroll.provider.getBalance(accounts[4].address)).toString(),
            initialBalance4.toString()
          );
        });
      });
    });
