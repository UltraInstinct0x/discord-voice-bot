const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const logger = require("./logger");
const CONFIG = require("../config/config");

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
    .setName("setprovider")
    .setDescription("Set TTS provider")
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription("Choose TTS provider")
        .setRequired(true)
        .addChoices(
          { name: "ElevenLabs", value: "elevenlabs" },
          { name: "Facebook MMS", value: "huggingface_facebook" },
          { name: "Facebook FastSpeech2", value: "huggingface_fastspeech" },
          { name: "Coqui XTTS-v2", value: "huggingface_coqui" },
          { name: "Indic TTS", value: "huggingface_indic" },
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

module.exports = {
  registerCommands,
  commands,
};
