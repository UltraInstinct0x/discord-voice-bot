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
const commandHandler = require("./handlers/commandHandler");
const settingsService = require("./services/settingsService");
const { registerCommands } = require("./utils/commandRegistrar");
const { CONFIG, RESPONSE_CONFIG } = require("./config/config");
const { PERMISSIONS } = require("./config/permissions");

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

// Initialize services
settingsService.initialize().catch(error => {
  logger.error("Failed to initialize settings service:", error);
  process.exit(1);
});

function getUserSettings(userId, guildId) {
  return {
    tier: "FREE",
    ttsProvider: CONFIG.DEFAULT_SETTINGS.ttsProvider,
    streaming: true,
    model: "GPT35",
    maxTokens: 150
  };
}

// Register slash commands
registerCommands();

// Message handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Get settings for all message types
  const settings = await settingsService.getServerSettings(message.guild.id);
  const userSettings = getUserSettings(message.author.id, message.guild.id);
  const clients = { openai, groq, anthropic, voice };

  // Handle legacy !machine command
  if (message.content.toLowerCase() === '!machine') {
    await messageHandler.handleMachineCommand(message, settings);
    return;
  }

  // Handle !agentic command
  if (message.content.toLowerCase() === '!agentic') {
    await messageHandler.handleAgenticCommand(message, settings);
    return;
  }

  // Handle normal messages (mentions, etc)
  if (message.mentions.has(client.user)) {
    await messageHandler.handleMessage(message, { ...settings, ...userSettings }, clients);
    return;
  }

  // Handle voice bot commands
  if (message.content.startsWith('!')) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    await messageHandler.handleCommand(message, command, args, settings);
    return;
  }
});

// Interaction handler for slash commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  try {
    const settings = await settingsService.getServerSettings(interaction.guild.id);
    await commandHandler.handleCommand(interaction, settings);
  } catch (error) {
    logger.error("Discord client error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true
      });
    }
  }
});

/* Voice state update handler
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await voiceHandler.handleVoiceStateUpdate(oldState, newState);
});*/

// Handle errors
client.on(Events.Error, error => {
  logger.error("Discord client error:", error);
});

// Login
client.login(CONFIG.DISCORD_TOKEN).catch(error => {
  logger.error("Failed to login:", error);
  process.exit(1);
});