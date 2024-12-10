const { getVoiceConnection } = require("@discordjs/voice");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const voiceHandler = require("./voiceHandler");
const logger = require("../utils/logger");

class MessageHandler {
  constructor() {
    this.settings = new Map();
  }

  getUserSettings(userId) {
    if (!this.settings.has(userId)) {
      this.settings.set(userId, {
        tier: "FREE",
        model: "GPT35",
        ttsProvider: "huggingface",
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
      const connection = await voiceHandler.joinVoiceChannel(channel, message);
      
      await message.reply(
        `Joined ${channel.name}!\n\nCurrent settings:\n` +
        `Tier: ${settings.tier}\n` +
        `TTS Provider: ${settings.ttsProvider}\n` +
        `Streaming: ${settings.streaming}\n` +
        `Model: ${settings.model}`
      );

    } catch (error) {
      logger.error('Error handling machine command', { 
        error: error.message,
        userId: message.author.id
      });
      await message.reply("Failed to join the voice channel.");
    }
  }
}

module.exports = new MessageHandler();
