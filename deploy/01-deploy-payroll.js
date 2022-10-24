const { network } = require("hardhat");
const {
  developmentChains,
  VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config");
const { verify } = require("../utils/verify");

module.exports = async (hre) => {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

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
    await verify(payroll.address, arguments);
  }
};

module.exports.tags = ["all", "payroll"];
