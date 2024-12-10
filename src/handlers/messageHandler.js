const { getVoiceConnection } = require("@discordjs/voice");
const voiceHandler = require("./voiceHandler");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const { generateInitialResponse } = require("../utils/responseUtils");
const { CONFIG, RESPONSE_CONFIG } = require("../config/config");
const logger = require("../utils/logger");

class MessageHandler {
  async handleMessage(message, settings, clients) {
    try {
      // Only respond to messages where bot is mentioned
      if (!message.mentions.has(message.client.user)) return;

      // Get the actual message content without the mention
      const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
      if (!prompt) return;

      // Log the message processing
      logger.info("Processing message", {
        isVoiceChannel: !!message.member?.voice.channel,
        prompt,
        userId: message.author.id,
      });

      // Check if user is in the same voice channel as the bot
      const connection = getVoiceConnection(message.guild.id);
      const isInSameVoiceChannel = connection && 
        message.member?.voice.channel?.id === connection.joinConfig.channelId;

      // Generate initial or thinking response based on message length
      let initialResponsePath;
      if (prompt.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD) {
        const thinkingResponse = RESPONSE_CONFIG.THINKING_RESPONSES[
          Math.floor(Math.random() * RESPONSE_CONFIG.THINKING_RESPONSES.length)
        ];
        initialResponsePath = await ttsService.generateTTS(thinkingResponse, settings.ttsProvider);
      } else if (isInSameVoiceChannel) {
        const username = message.author.username;
        const initialResponse = generateInitialResponse(prompt, username);
        initialResponsePath = await ttsService.generateTTS(initialResponse, settings.ttsProvider);
      }

      // Play initial response if in voice channel
      if (isInSameVoiceChannel && initialResponsePath) {
        await voiceHandler.playResponse(initialResponsePath, connection);
      }

      // Generate AI response
      const aiResponse = await aiService.handleResponse(prompt, settings);

      // Handle long responses differently
      if (aiResponse.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD && isInSameVoiceChannel) {
        const summary = await aiService.handleResponse(
          `Summarize this in 2-3 sentences while keeping the main points: ${aiResponse}`,
          settings
        );
        const ttsResponse = `Here's a summary: ${summary}\nCheck the chat for the complete response.`;
        
        // Send full response in text channel with embed
        await message.reply({
          embeds: [{
            color: 0x0099ff,
            description: aiResponse,
            footer: {
              text: "🤖 AI-generated response"
            }
          }]
        });
        
        // Generate and play TTS for summary
        const audioPath = await ttsService.generateTTS(ttsResponse, settings.ttsProvider);
        await voiceHandler.playResponse(audioPath, connection);
      } else {
        // For shorter responses, handle normally
        await message.reply({
          embeds: [{
            color: 0x0099ff,
            description: aiResponse,
            footer: {
              text: "🤖 AI-generated response"
            }
          }]
        });
        if (isInSameVoiceChannel) {
          const audioPath = await ttsService.generateTTS(aiResponse, settings.ttsProvider);
          await voiceHandler.playResponse(audioPath, connection);
        }
      }
    } catch (error) {
      logger.error("Error handling message", { error: error.message });
      await message.reply("Sorry, I encountered an error while processing your request.");
    }
  }

  async handleMachineCommand(message, settings, clients) {
    try {
      const channel = message.member?.voice.channel;
      if (!channel) {
        await message.reply("You need to be in a voice channel to use this command!");
        return;
      }

      const existingConnection = getVoiceConnection(channel.guild.id);
      if (existingConnection) {
        existingConnection.destroy();
        await message.reply({
          content: "",
          embeds: [{
            color: 0xFF6B6B,
            description: "👋 **Disconnected!** Have a great day!",
            footer: {
              text: "Use !machine or /agentic to call me back anytime!"
            }
          }]
        });
        return;
      }

      const connection = await voiceHandler.joinVoiceChannel(channel, message);
      if (!connection) {
        await message.reply({
          content: "",
          embeds: [{
            color: 0xFF6B6B,
            description: "❌ **Failed to join the voice channel.** Please try again.",
            footer: {
              text: "Make sure I have the right permissions!"
            }
          }]
        });
        return;
      }

      logger.info("Voice connection ready", {
        channelId: channel.id,
        guildId: channel.guild.id,
      });

      await message.reply({
        content: "",
        embeds: [{
          color: 0x4CAF50,
          description: "🎙️ **Connected successfully!**\nI'm ready to chat with you in the voice channel.",
          fields: [
            {
              name: "Voice Commands",
              value: "Just start speaking and I'll respond!",
              inline: true
            },
            {
              name: "Text Commands",
              value: "@ mention me in chat to talk!",
              inline: true
            }
          ],
          footer: {
            text: "Use !machine or /agentic again to disconnect"
          }
        }]
      });

      // Start listening to the user
      await voiceHandler.listenAndRespond(connection, connection.receiver, message);
    } catch (error) {
      logger.error("Error handling machine command", { error: error.message });
      await message.reply("Sorry, I encountered an error while processing your command.");
    }
  }

  async handleInteraction(interaction, settings, clients) {
    try {
      const command = interaction.commandName;
      const channel = interaction.channel;

      switch (command) {
        case "agentic":
          await this.handleMachineCommand(interaction, settings, clients);
          break;

        case "model":
          const model = interaction.options.getString("model");
          if (!CONFIG.TIERS[settings.tier].allowedModels.includes(model)) {
            await interaction.reply(
              `This model is not available in your tier. Available models: ${CONFIG.TIERS[settings.tier].allowedModels.join(", ")}`
            );
            return;
          }
          settings.model = model;
          await interaction.reply(`Model set to ${model}`);
          break;

        case "settier":
          const tier = interaction.options.getString("tier");
          settings.tier = tier;
          settings.ttsProvider = CONFIG.TIERS[tier].ttsProvider;
          settings.streaming = CONFIG.TIERS[tier].streaming;
          await interaction.reply(`Tier set to ${tier}`);
          break;

        case "setprovider":
          const provider = interaction.options.getString("provider");
          settings.ttsProvider = provider;
          await interaction.reply(`TTS provider set to ${provider}`);
          break;

        case "settings":
          const embed = {
            title: "Your Settings",
            fields: [
              { name: "Tier", value: settings.tier, inline: true },
              { name: "Model", value: settings.model, inline: true },
              { name: "TTS Provider", value: settings.ttsProvider, inline: true },
              { name: "Streaming", value: settings.streaming.toString(), inline: true },
            ],
          };
          await interaction.reply({ embeds: [embed] });
          break;

        case "test":
          const feature = interaction.options.getString("feature");
          switch (feature) {
            case "voice":
              await interaction.reply("Testing voice recognition...");
              break;
            case "text":
              const response = await aiService.handleResponse(
                "Test message: Please respond with a short greeting.",
                settings
              );
              await interaction.reply(`AI Test Response: ${response}`);
              break;
            case "tts":
              await interaction.reply("Testing TTS...");
              const ttsPath = await ttsService.generateTTS(
                "This is a test of the text to speech system.",
                settings.ttsProvider
              );
              const connection = interaction.member?.voice.channel
                ? await voiceHandler.joinVoiceChannel(
                    interaction.member.voice.channel,
                    interaction
                  )
                : null;
              if (connection) {
                await voiceHandler.playResponse(ttsPath, connection);
              }
              break;
            default:
              await interaction.reply("Unknown test feature");
          }
          break;

        default:
          await interaction.reply("Unknown command");
      }
    } catch (error) {
      logger.error("Error handling interaction", { error: error.message });
      await interaction.reply({
        content: "An error occurred while processing your command.",
        ephemeral: true,
      });
    }
  }
}

module.exports = new MessageHandler();
