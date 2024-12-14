const { getVoiceConnection } = require("@discordjs/voice");
const voiceHandler = require("./voiceHandler");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const { generateInitialResponse } = require("../utils/responseUtils");
const { CONFIG, RESPONSE_CONFIG } = require("../config/config");
const logger = require("../utils/logger");
const fs = require("fs");

class MessageHandler {
  async handleMessage(message, settings, clients, isVoiceInput = false) {
    let initialResponsePath = null;
    let audioPath = null;
    
    try {
      // Only respond to messages where bot is mentioned and not slash commands
      if (!message.mentions.has(message.client.user) || message.content.startsWith('/')) return;

      // Get the actual message content without the mention
      const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
      if (!prompt) return;

      // Log the message processing
      const userId = message.author?.id;
      const guildId = message.guild?.id;
      const isPremium = settings.tier === 'PREMIUM';

      logger.info("Processing message", {
        isVoiceChannel: !!message.member?.voice.channel,
        prompt,
        userId,
        isPremium
      });

      // Check if user is in a voice channel but bot isn't connected
      if (message.member?.voice.channel && !getVoiceConnection(message.guild.id) && settings.autoJoin) {
        const connection = await voiceHandler.joinVoiceChannel(
          message.member.voice.channel,
          message
        );
        if (connection) {
          await message.reply({
            embeds: [{
              color: 0x0099ff,
              title: "Voice Mode Activated! ",
              description: "Auto-joined your voice channel! (You can disable this with `/settings autojoin off`)",
              fields: [
                {
                  name: "Voice Commands",
                  value: "Just start speaking and I'll respond!",
                  inline: true
                },
                {
                  name: "Text Commands",
                  value: "Keep mentioning me in chat to talk!",
                  inline: true
                }
              ],
              footer: {
                text: "Use !machine or /agentic to disconnect"
              }
            }]
          });
          await voiceHandler.listenAndRespond(connection, connection.receiver, message);
        }
      } else if (message.member?.voice.channel && !getVoiceConnection(message.guild.id) && !settings.autoJoin) {
        // If user is in voice but autoJoin is off, suggest using commands
        await message.reply({
          embeds: [{
            color: 0x0099ff,
            title: "Want Voice Chat? ",
            description: "I noticed you're in a voice channel! You can:",
            fields: [
              {
                name: "Join Now",
                value: "Use `!machine` or `/agentic` to make me join your voice channel",
                inline: true
              },
              {
                name: "Auto-Join",
                value: "Enable auto-join with `/settings autojoin on` to make me join automatically",
                inline: true
              }
            ]
          }]
        });
      }

      // Check if user is in the same voice channel as the bot
      const connection = getVoiceConnection(message.guild.id);
      const isInSameVoiceChannel = connection && 
        message.member?.voice.channel?.id === connection.joinConfig.channelId;

      // For voice input, validate transcription first
      if (isVoiceInput) {
        if (prompt === RESPONSE_CONFIG.ERROR_MESSAGES.AUDIO_TOO_QUIET) {
          await message.reply({
            embeds: [{
              color: 0xffcc00,
              title: " Audio Too Quiet",
              description: "I couldn't hear you clearly. Please speak a bit louder."
            }]
          });
          return;
        }
        if (prompt === RESPONSE_CONFIG.ERROR_MESSAGES.AUDIO_TOO_SHORT) {
          await message.reply({
            embeds: [{
              color: 0xffcc00,
              title: " Audio Too Short",
              description: "The audio was too short to process. Please speak for a bit longer."
            }]
          });
          return;
        }
        if (prompt === RESPONSE_CONFIG.ERROR_MESSAGES.TRANSCRIPTION_FAILED) {
          await message.reply({
            embeds: [{
              color: 0xff0000,
              title: " Transcription Failed",
              description: "I couldn't understand what you said. Please try speaking more clearly."
            }]
          });
          return;
        }
      }

      // Generate initial or thinking response based on message length
      if (prompt.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD) {
        const thinkingResponse = RESPONSE_CONFIG.THINKING_RESPONSES[
          Math.floor(Math.random() * RESPONSE_CONFIG.THINKING_RESPONSES.length)
        ];
        if (isInSameVoiceChannel) {
          initialResponsePath = await ttsService.generateTTS(thinkingResponse, settings.ttsProvider, {
            isVoiceInput,
            isPremium
          });
          // Play initial response asynchronously
          voiceHandler.playResponse(initialResponsePath, connection);
        }
      } else if (isInSameVoiceChannel) {
        const username = message.author.username;
        const initialResponse = generateInitialResponse(prompt, username);
        initialResponsePath = await ttsService.generateTTS(initialResponse, settings.ttsProvider, {
          isVoiceInput,
          isPremium
        });
        // Play initial response asynchronously
        voiceHandler.playResponse(initialResponsePath, connection);
      }

      // Get AI response
      const response = await aiService.handleResponse(prompt, settings, clients);

      // Send text response immediately with embed
      await message.reply({
        embeds: [{
          color: 0x0099ff,
          description: response,
          footer: {
            text: `Model: ${settings.model || "GPT35"}`
          }
        }]
      });

      // Generate and play TTS asynchronously if in voice channel
      if (isInSameVoiceChannel) {
        audioPath = await ttsService.generateTTS(response, settings.ttsProvider, {
          isVoiceInput,
          isPremium
        });
        voiceHandler.playResponse(audioPath, connection);
      }

    } catch (error) {
      logger.error("Error handling message", { error: error.message });
      await message.reply({
        embeds: [{
          color: 0xff0000,
          title: " Error",
          description: "Sorry, I encountered an error while processing your message."
        }]
      });
    } finally {
      // Cleanup temporary files
      if (initialResponsePath && fs.existsSync(initialResponsePath)) {
        fs.unlinkSync(initialResponsePath);
      }
      if (audioPath && fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }
  }

  async handleMachineCommand(message, settings) {
    try {
      // Check if bot is already in a voice channel
      const existingConnection = getVoiceConnection(message.guild.id);
      if (existingConnection) {
        // If bot is in a voice channel, leave it
        existingConnection.destroy();
        await message.reply({
          embeds: [{
            color: 0x0099ff,
            title: "Voice Mode Deactivated ",
            description: "I've left the voice channel, but I'm still here to help!",
            fields: [
              {
                name: "Text Chat",
                value: "You can still mention me in chat anytime!",
                inline: true
              },
              {
                name: "Ongoing Tasks",
                value: "Don't worry, I'll keep working on any ongoing tasks.",
                inline: true
              }
            ],
            footer: {
              text: "Use !machine or /agentic to join voice again"
            }
          }]
        });
        return;
      }

      // Check if user is in a voice channel
      if (!message.member?.voice.channel) {
        await message.reply("You need to be in a voice channel first!");
        return;
      }

      // Get or create voice connection
      const connection = await voiceHandler.joinVoiceChannel(
        message.member.voice.channel,
        message
      );

      if (!connection) {
        await message.reply("Failed to join voice channel. Please try again.");
        return;
      }

      // Send welcome message
      await message.reply({
        embeds: [{
          color: 0x0099ff,
          title: "Voice Bot Connected! ",
          description: "I'm ready to chat with you in voice! Here's how to use me:",
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

  async handleAgenticCommand(message, settings) {
    try {
      // Check if bot is already in a voice channel
      const existingConnection = getVoiceConnection(message.guild.id);
      if (existingConnection) {
        // If bot is in a voice channel, leave it
        existingConnection.destroy();
        await message.reply({
          embeds: [{
            color: 0x0099ff,
            title: "Agentic Mode Deactivated ",
            description: "I've left the voice channel, but I'm still here to help!",
            fields: [
              {
                name: "Text Chat",
                value: "You can still mention me in chat anytime!",
                inline: true
              },
              {
                name: "Ongoing Tasks",
                value: "Don't worry, I'll keep working on any ongoing tasks.",
                inline: true
              }
            ],
            footer: {
              text: "Use !agentic or /agentic to activate voice mode again"
            }
          }]
        });
        return;
      }

      // Check if user is in a voice channel
      if (!message.member?.voice.channel) {
        await message.reply("You need to be in a voice channel first!");
        return;
      }

      // Get or create voice connection
      const connection = await voiceHandler.joinVoiceChannel(
        message.member.voice.channel,
        message
      );

      if (!connection) {
        await message.reply("Failed to join voice channel. Please try again.");
        return;
      }

      // Send welcome message
      await message.reply({
        embeds: [{
          color: 0x0099ff,
          title: "Agentic Mode Activated! ",
          description: "I'm now in agentic mode! I'll proactively engage in conversation and help you with tasks.",
          fields: [
            {
              name: "Voice Interaction",
              value: "Speak naturally and I'll understand context and follow up!",
              inline: true
            },
            {
              name: "Task Assistance",
              value: "Ask me to help with tasks and I'll guide you through them!",
              inline: true
            }
          ],
          footer: {
            text: "Use !agentic or /agentic again to disconnect"
          }
        }]
      });

      // Start listening in agentic mode
      await voiceHandler.listenAndRespond(connection, connection.receiver, message, true);
    } catch (error) {
      logger.error("Error handling agentic command", { error: error.message });
      await message.reply("Sorry, I encountered an error while activating agentic mode.");
    }
  }

  async handleCommand(message, command, args, settings) {
    try {
      switch (command) {
        case 'settier':
          const tier = args[0]?.toUpperCase();
          if (!tier || !['FREE', 'PREMIUM'].includes(tier)) {
            await message.reply('Invalid tier. Please use FREE or PREMIUM');
            return;
          }
          settings.tier = tier;
          await message.reply(`Tier set to ${tier}`);
          break;

        case 'setmodel':
          const model = args[0]?.toLowerCase();
          if (!model || !CONFIG.TIERS[settings.tier].allowedModels.includes(model)) {
            await message.reply(`Invalid model. Available models for your tier: ${CONFIG.TIERS[settings.tier].allowedModels.join(', ')}`);
            return;
          }
          settings.model = model;
          await message.reply(`Model set to ${model}`);
          break;

        case 'settings':
          const embed = {
            color: 0x0099ff,
            title: 'Current Settings',
            fields: [
              { name: 'Tier', value: settings.tier || 'FREE', inline: true },
              { name: 'Model', value: settings.model || 'gpt-3.5-turbo', inline: true },
              { name: 'TTS Provider', value: settings.ttsProvider || 'tiktok', inline: true }
            ]
          };
          await message.reply({ embeds: [embed] });
          break;

        default:
          await message.reply('Unknown command. Available commands: !settier, !setmodel, !settings');
      }
    } catch (error) {
      logger.error('Error handling command', { error: error.message, command });
      await message.reply('Sorry, I encountered an error while processing your command.');
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
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "There was an error while executing this command!",
          ephemeral: true
        });
      }
    }
  }
}

module.exports = new MessageHandler();
