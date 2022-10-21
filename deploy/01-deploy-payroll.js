const { network, ethers } = require("hardhat");
const {
  networkConfig,
  developmentChains,
  VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

module.exports = async (hre) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;

  const blockConfirmations = developmentChains.includes(network.name)
    ? 1
    : VERIFICATION_BLOCK_CONFIRMATIONS;
  const arguments = [];

  // Deploy the contract
  const payroll = await deploy("Payroll", {
    from: deployer,
    args: arguments,
    log: true,
    waitConfirmations: blockConfirmations,
  });

  // Verify the contract
  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...");
    await verify(payroll.address, arguments);
  }
};

module.exports.tags = ["all", "payroll"];
