const { getVoiceConnection } = require("@discordjs/voice");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const voiceHandler = require("./voiceHandler");
const logger = require("../utils/logger");
const CONFIG = require("../config/config");

class MessageHandler {
  constructor() {
    this.settings = new Map();
  }

  getUserSettings(userId) {
    if (!this.settings.has(userId)) {
      this.settings.set(userId, {
        tier: "FREE",
        model: "GPT35",
        ttsProvider: CONFIG.TTS_PROVIDERS.HUGGINGFACE_FACEBOOK,
        streaming: false,
      });
    }
    return this.settings.get(userId);
  }

  async handleMessage(message, client) {
    // Ignore messages from bots
    if (message.author.bot) return;

    const botVoiceConnection = getVoiceConnection(message.guild.id);
    const isInVoiceChannel = botVoiceConnection && 
                          message.member?.voice.channel?.id === botVoiceConnection.joinConfig.channelId;

    // Only process messages if the bot is mentioned or in the same voice channel
    if (!isInVoiceChannel && !message.mentions.has(client.user)) return;

    try {
      const settings = this.getUserSettings(message.author.id);
      let prompt = message.mentions.has(client.user) 
        ? message.content.replace(`<@${client.user.id}>`, '').trim()
        : message.content.trim();

      // Handle attachments
      if (message.attachments.size > 0) {
        const attachmentDescriptions = await Promise.all(
          message.attachments.map(async (attachment) => {
            if (attachment.contentType?.startsWith('image/')) {
              return `[Image attached: ${attachment.name}]`;
            } else if (attachment.contentType?.startsWith('text/')) {
              const response = await fetch(attachment.url);
              const text = await response.text();
              return `[Text content from ${attachment.name}]: ${text}`;
            }
            return `[File attached: ${attachment.name}]`;
          })
        );
        prompt = `${prompt}\n\nAttachments:\n${attachmentDescriptions.join('\n')}`;
      }

      logger.info('Processing message', { 
        userId: message.author.id,
        prompt: prompt.substring(0, 100),
        isVoiceChannel: isInVoiceChannel
      });

      // Generate and send the response
      const response = await aiService.handleResponse(prompt, settings);
      await message.reply(response);

      // Send voice response if in voice channel
      if (isInVoiceChannel && botVoiceConnection) {
        const audioPath = await ttsService.generateTTS(response, settings.ttsProvider);
        await voiceHandler.playResponse(audioPath, botVoiceConnection);
      }
    } catch (error) {
      logger.error('Error handling message', { 
        error: error.message,
        userId: message.author.id
      });
      await message.reply('Sorry, I encountered an error while processing your request.');
    }
  }

  async handleMachineCommand(message) {
    try {
      const channel = message.member?.voice.channel;
      if (!channel) {
        await message.reply("You need to be in a voice channel first!");
        return;
      }

      const existingConnection = getVoiceConnection(message.guild.id);
      if (existingConnection) {
        existingConnection.destroy();
        voiceHandler.cleanup();
        await message.reply("Left the voice channel!");
        return;
      }

      const settings = this.getUserSettings(message.author.id);
      const modelConfig = CONFIG.MODELS[settings.model];
      const connection = await voiceHandler.joinVoiceChannel(channel, message);
      
      await message.reply(
        `Joined ${channel.name}!\n\n` +
        `Current settings:\n` +
        `Tier: ${settings.tier}\n` +
        `Model: ${settings.model} (Provider: ${modelConfig.provider})\n` +
        `TTS Provider: ${settings.ttsProvider}\n` +
        `Streaming: ${settings.streaming}`
      );

    } catch (error) {
      logger.error('Error handling machine command', { 
        error: error.message,
        userId: message.author.id
      });
      await message.reply("Failed to join the voice channel.");
    }
  }

  async handleInteraction(interaction) {
    try {
      const settings = this.getUserSettings(interaction.user.id);

      switch (interaction.commandName) {
        case 'agentic':
          await this.handleMachineCommand(interaction);
          break;

        case 'model':
          const newModel = interaction.options.getString('model');
          const tier = settings.tier;
          if (!CONFIG.TIERS[tier].allowedModels.includes(newModel)) {
            await interaction.reply(`Your tier (${tier}) does not have access to this model. Available models: ${CONFIG.TIERS[tier].allowedModels.join(', ')}`);
            return;
          }
          settings.model = newModel;
          this.settings.set(interaction.user.id, settings);
          await interaction.reply(`Model set to ${newModel}`);
          break;

        case 'settier':
          const newTier = interaction.options.getString('tier');
          settings.tier = newTier;
          settings.streaming = CONFIG.TIERS[newTier].streaming;
          settings.ttsProvider = CONFIG.TIERS[newTier].ttsProvider;
          if (!CONFIG.TIERS[newTier].allowedModels.includes(settings.model)) {
            settings.model = CONFIG.TIERS[newTier].allowedModels[0];
          }
          this.settings.set(interaction.user.id, settings);
          await interaction.reply(`Tier set to ${newTier}. Your settings have been updated accordingly.`);
          break;

        case 'setprovider':
          const newProvider = interaction.options.getString('provider');
          settings.ttsProvider = newProvider;
          this.settings.set(interaction.user.id, settings);
          await interaction.reply(`TTS provider set to ${newProvider}`);
          break;

        case 'settings':
          const modelConfig = CONFIG.MODELS[settings.model];
          await interaction.reply(
            `Your current settings:\n` +
            `Tier: ${settings.tier}\n` +
            `Model: ${settings.model} (Provider: ${modelConfig.provider})\n` +
            `TTS Provider: ${settings.ttsProvider}\n` +
            `Streaming: ${settings.streaming}`
          );
          break;

        case 'test':
          const feature = interaction.options.getString('feature');
          switch (feature) {
            case 'voice':
              if (!interaction.member?.voice.channel) {
                await interaction.reply('Please join a voice channel first!');
                return;
              }
              await interaction.reply('Testing voice recognition...');
              // Add voice recognition test logic here
              break;
            case 'text':
              const response = await aiService.handleResponse('This is a test message.', settings);
              await interaction.reply(`Test response: ${response}`);
              break;
            case 'tts':
              if (!interaction.member?.voice.channel) {
                await interaction.reply('Please join a voice channel first!');
                return;
              }
              const audioPath = await ttsService.generateTTS('This is a test TTS message.', settings.ttsProvider);
              const connection = getVoiceConnection(interaction.guild.id);
              if (connection) {
                await voiceHandler.playResponse(audioPath, connection);
                await interaction.reply('Playing test TTS message...');
              } else {
                await interaction.reply('Bot is not in a voice channel. Use /agentic to make it join first.');
              }
              break;
          }
          break;
      }
    } catch (error) {
      logger.error('Error handling interaction', {
        error: error.message,
        userId: interaction.user.id,
        command: interaction.commandName
      });
      await interaction.reply('Sorry, I encountered an error while processing your request.');
    }
  }

  cleanup() {
    voiceHandler.cleanup();
  }
}

module.exports = new MessageHandler();
