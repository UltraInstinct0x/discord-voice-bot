require("dotenv").config();
const express = require("express");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const messageHandler = require("./handlers/messageHandler");
const logger = require("./utils/logger");
const { registerCommands } = require("./utils/commandRegistrar");

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
    GatewayIntentBits.GuildMembers,
  ],
});

// Event handlers
client.on(Events.ClientReady, () => {
  logger.info("Discord bot is ready!");
  registerCommands();
});

client.on(Events.MessageCreate, async (message) => {
  await messageHandler.handleMessage(message, client);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  await messageHandler.handleInteraction(interaction);
});

client.on("error", (error) => {
  logger.error("Discord client error", { error: error.message });
  messageHandler.cleanup();
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
  messageHandler.cleanup();
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT. Cleaning up...");
  messageHandler.cleanup();
  process.exit(0);
});

// Start the bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error("Failed to start bot", { error: error.message });
  process.exit(1);
});
