const { SlashCommandBuilder } = require('@discordjs/builders');
const logger = require('../utils/logger');
const settingsService = require('../services/settingsService');
const { CONFIG } = require('../config/config');

class CommandHandler {
    constructor() {
        this.commands = new Map();
    }

    async handleCommand(interaction, settings) {
        if (!interaction.isCommand()) return;

        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'settings':
                    return this.handleSettingsCommand(interaction, settings);
                case 'setprovider':
                    return this.handleSetProviderCommand(interaction, settings);
                default:
                    return interaction.reply({ 
                        content: 'Unknown command', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            logger.error('Error handling command', {
                error: error.message,
                command: commandName
            });
            return interaction.reply({ 
                content: 'There was an error executing this command', 
                ephemeral: true 
            });
        }
    }

    async handleSettingsCommand(interaction, settings) {
        try {
            const settingsEmbed = {
                color: 0x0099ff,
                title: 'Current Bot Settings',
                fields: [
                    {
                        name: 'TTS Provider',
                        value: settings.ttsProvider || CONFIG.DEFAULT_SETTINGS.ttsProvider,
                        inline: true
                    },
                    {
                        name: 'Language',
                        value: settings.language || CONFIG.DEFAULT_SETTINGS.language,
                        inline: true
                    },
                    {
                        name: 'Voice Commands',
                        value: (settings.voiceCommand || CONFIG.DEFAULT_SETTINGS.voiceCommand) ? 'Enabled' : 'Disabled',
                        inline: true
                    },
                    {
                        name: 'Auto Join',
                        value: (settings.autoJoin || CONFIG.DEFAULT_SETTINGS.autoJoin) ? 'Enabled' : 'Disabled',
                        inline: true
                    }
                ],
                timestamp: new Date(),
                footer: {
                    text: `Server ID: ${interaction.guildId}`
                }
            };

            return interaction.reply({
                embeds: [settingsEmbed],
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error displaying settings', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to display settings',
                ephemeral: true
            });
        }
    }

    async handleSetProviderCommand(interaction, settings) {
        const provider = interaction.options.getString('provider');
        
        // Validate provider
        const validProviders = ['tiktok', 'huggingface_facebook', 'elevenlabs', 'huggingface_fastspeech'];
        if (!validProviders.includes(provider)) {
            return interaction.reply({
                content: 'Invalid provider. Valid options are: TikTok, HuggingFace, ElevenLabs, FastSpeech2',
                ephemeral: true
            });
        }

        // Check if provider is available based on tier
        const isPremium = false; // TODO: Implement premium check
        if (!isPremium && (provider === 'elevenlabs')) {
            return interaction.reply({
                content: 'ElevenLabs is only available for premium users.',
                ephemeral: true
            });
        }

        try {
            // Update settings using settingsService
            await settingsService.updateServerSettings(interaction.guildId, {
                ...settings,
                ttsProvider: provider
            });

            const providerName = {
                'tiktok': 'TikTok',
                'huggingface_facebook': 'HuggingFace',
                'elevenlabs': 'ElevenLabs',
                'huggingface_fastspeech': 'FastSpeech2'
            }[provider];

            return interaction.reply({
                content: `TTS provider set to ${providerName}`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Failed to set TTS provider', {
                error: error.message,
                provider,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to set TTS provider. Please try again later.',
                ephemeral: true
            });
        }
    }
}

module.exports = new CommandHandler();