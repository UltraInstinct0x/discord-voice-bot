const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const logger = require("./logger");
const { CONFIG } = require("../config/config");

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("agentic")
    .setDescription("Toggle agentic mode (join/leave voice channel)"),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Set the AI model to use")
    .addStringOption((option) =>
      option
        .setName("model")
        .setDescription("Choose the AI model")
        .setRequired(true)
        .addChoices(
          { name: "GPT-3.5", value: "GPT35" },
          { name: "GPT-4", value: "GPT4" },
          { name: "Claude Sonnet", value: "CLAUDE" },
          { name: "Mixtral-8x7B", value: "MIXTRAL" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("setprovider")
    .setDescription("Set the TTS provider")
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription("The TTS provider to use")
        .setRequired(true)
        .addChoices(
          { name: 'TikTok', value: 'tiktok' },
          { name: 'HuggingFace Facebook', value: 'huggingface_facebook' },
          { name: 'HuggingFace FastSpeech2', value: 'huggingface_fastspeech' },
          { name: 'HuggingFace Coqui', value: 'huggingface_coqui' },
          { name: 'HuggingFace Indic', value: 'huggingface_indic' },
          { name: 'ElevenLabs', value: 'elevenlabs' }
        ),
    ),
  new SlashCommandBuilder()
    .setName("test")
    .setDescription("Test the bot's functionality")
    .addStringOption((option) =>
      option
        .setName("feature")
        .setDescription("Feature to test")
        .setRequired(true)
        .addChoices(
          { name: "Voice Recognition", value: "voice" },
          { name: "Text Generation", value: "text" },
          { name: "TTS", value: "tts" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("settier")
    .setDescription("Set your tier")
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Choose your tier")
        .setRequired(true)
        .addChoices(
          { name: "Free", value: "FREE" },
          { name: "Premium", value: "PREMIUM" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("View your current settings"),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    logger.info("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    logger.info("Slash commands registered successfully");
  } catch (error) {
    logger.error("Error registering commands", { error: error.message });
  }
}

module.exports = { registerCommands };
