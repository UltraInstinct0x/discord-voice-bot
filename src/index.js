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
  const serverSettings = settingsService.getServerSettings(guildId);
  const defaultSettings = {
    tier: "FREE",
    ttsProvider: CONFIG.TIERS.FREE.ttsProvider,
    streaming: CONFIG.TIERS.FREE.streaming,
    model: CONFIG.TIERS.FREE.allowedModels[0],
    maxTokens: CONFIG.TIERS.FREE.maxTokens,
    ...serverSettings.voiceSettings
  };

  return defaultSettings;
}

// Register slash commands
registerCommands();

// Message handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Get settings for all message types
  const settings = getUserSettings(message.author.id, message.guild.id);
  const clients = { openai, groq, anthropic, voice };

  // Handle legacy !machine command
  if (message.content.toLowerCase() === '!machine') {
    await commandHandler.handleLegacyCommand(message);
    return;
  }

  // Handle normal messages (mentions, etc)
  if (message.mentions.has(client.user)) {
    await messageHandler.handleMessage(message, settings, clients);
    return;
  }

  // Handle voice bot commands
  if (message.content.startsWith('!')) {
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    await commandHandler.handleCommand(message, command, args);
    return;
  }
});

// Command handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;
  await commandHandler.handleInteraction(interaction);
});

// Voice state update handler
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // Handle bot disconnection
  if (oldState.member?.id === client.user?.id && !newState.channel) {
    voiceHandler.cleanup();
    
    // Clear channel reference in settings
    const settings = await settingsService.getServerSettings(oldState.guild.id);
    if (settings) {
      settings.setChannel(null);
      await settingsService.saveSettings(oldState.guild.id, settings);
    }
  }

  // Handle user leaving voice channel
  if (oldState.channel && !newState.channel) {
    const settings = await settingsService.getServerSettings(oldState.guild.id);
    if (settings && settings.adminId === oldState.member.id) {
      const timeoutDuration = PERMISSIONS.TIMEOUTS.VOICE_SESSION;
      setTimeout(async () => {
        const currentSettings = await settingsService.getServerSettings(oldState.guild.id);
        if (currentSettings && 
            currentSettings.adminId === oldState.member.id && 
            !oldState.member.voice.channel) {
          currentSettings.setAdmin(null);
          await settingsService.saveSettings(oldState.guild.id, currentSettings);
          if (oldState.channel) {
            oldState.channel.send("Bot admin has been reset due to inactivity.");
          }
        }
      }, timeoutDuration);
    }
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