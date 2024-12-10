require("dotenv").config();
const { OpenAI } = require("openai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const ElevenLabs = require("elevenlabs-node");
const {
  Client,
  GatewayIntentBits,
  Events,
} = require("discord.js");
const express = require("express");
const logger = require("./utils/logger");
const messageHandler = require("./handlers/messageHandler");
const voiceHandler = require("./handlers/voiceHandler");
const { registerCommands } = require("./utils/commandRegistrar");
const { CONFIG, RESPONSE_CONFIG } = require("./config/config");

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const voice = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Initialize Express app for keeping the service alive
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

// Initialize user settings
const userSettings = new Map();

function getUserSettings(userId) {
  const defaultSettings = {
    tier: "FREE",
    ttsProvider: CONFIG.TIERS.FREE.ttsProvider,
    streaming: CONFIG.TIERS.FREE.streaming,
    model: CONFIG.TIERS.FREE.allowedModels[0],
    maxTokens: CONFIG.TIERS.FREE.maxTokens
  };

  if (!userSettings.has(userId)) {
    userSettings.set(userId, defaultSettings);
  }
  return userSettings.get(userId);
}

// Register slash commands
registerCommands();

// Command handlers
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  const settings = getUserSettings(interaction.user.id);
  await messageHandler.handleInteraction(interaction, settings, {
    openai,
    groq,
    anthropic,
    voice,
  });
});

// Message handler
client.on(Events.MessageCreate, async (message) => {
  // Handle !machine command
  if (message.content.toLowerCase() === "!machine") {
    const settings = getUserSettings(message.author.id);
    await messageHandler.handleMachineCommand(message, settings, {
      openai,
      groq,
      anthropic,
      voice,
    });
    return;
  }
  const settings = getUserSettings(message.author.id);
  await messageHandler.handleMessage(message, settings, {
    openai,
    groq,
    anthropic,
    voice,
  });
});

// Voice state update handler
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Handle bot disconnection
  if (oldState.member?.id === client.user?.id && !newState.channel) {
    voiceHandler.cleanup();
  }
});

// Error handler
client.on("error", (error) => {
  logger.error("Discord client error:", error);
  voiceHandler.cleanup();
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT. Cleaning up...");
  voiceHandler.cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM. Cleaning up...");
  voiceHandler.cleanup();
  process.exit(0);
});

// Start the bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});