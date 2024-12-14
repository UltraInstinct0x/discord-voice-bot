const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const logger = require("./logger");
const { CONFIG } = require("../config/config");

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Show current bot settings"),
  new SlashCommandBuilder()
    .setName("setprovider")
    .setDescription("Set the TTS provider")
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription("The TTS provider to use")
        .setRequired(true)
        .addChoices(
          { name: "TikTok", value: "tiktok" },
          { name: "HuggingFace Facebook", value: "huggingface_facebook" },
          { name: "ElevenLabs", value: "elevenlabs" },
          { name: "FastSpeech2", value: "huggingface_fastspeech" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("agentic")
    .setDescription("Toggle agentic mode (join/leave voice channel)"),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Set the AI model")
    .addStringOption((option) =>
      option
        .setName("model")
        .setDescription("The AI model to use")
        .setRequired(true)
        .addChoices(
          { name: "GPT-3.5", value: "GPT35" },
          { name: "GPT-4", value: "GPT4" },
          { name: "Claude Sonnet", value: "CLAUDE" },
          { name: "Mixtral-8x7B", value: "MIXTRAL" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("settier")
    .setDescription("Set your subscription tier")
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Your subscription tier")
        .setRequired(true)
        .addChoices(
          { name: "Free", value: "FREE" },
          { name: "Premium", value: "PREMIUM" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("configure")
    .setDescription("Configure bot settings"),
  new SlashCommandBuilder()
    .setName("setautojoin")
    .setDescription("Configure auto-join behavior")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Enable or disable auto-join")
        .setRequired(true),
    ),
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
