require("dotenv").config();

const developmentChains = ["hardhat", "localhost"];
const VERIFICATION_BLOCK_CONFIRMATIONS = 6;
const RECIPIENT_1_ADDRESS = process.env.RECIPIENT_1_ADDRESS || "0x";
const RECIPIENT_2_ADDRESS = process.env.RECIPIENT_2_ADDRESS || "0x";

module.exports = {
  developmentChains,
  VERIFICATION_BLOCK_CONFIRMATIONS,
  RECIPIENT_1_ADDRESS,
  RECIPIENT_2_ADDRESS,
};
