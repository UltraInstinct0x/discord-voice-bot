require("dotenv").config();
const { Client, Events, GatewayIntentBits } = require("discord.js");
const express = require("express");
const messageHandler = require("./handlers/messageHandler");
const logger = require("./utils/logger");

// Create temp directory if it doesn't exist
const fs = require("fs");
const path = require("path");
const tempDir = path.join(__dirname, "../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Initialize Express server
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Discord bot is running!");
});

app.listen(port, () => {
  logger.info(`Web server listening on port ${port}`);
});

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Event handlers
client.on(Events.ClientReady, () => {
  logger.info("Discord bot is ready!");
});

client.on(Events.MessageCreate, async (message) => {
  if (message.content.toLowerCase() === "!machine") {
    await messageHandler.handleMachineCommand(message);
  } else {
    await messageHandler.handleMessage(message, client);
  }
});

client.on("error", (error) => {
  logger.error("Discord client error", { error: error.message });
});

// Start the bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error("Failed to start bot", { error: error.message });
  process.exit(1);
});
