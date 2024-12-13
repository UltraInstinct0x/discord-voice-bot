const { PERMISSIONS } = require('../config/permissions');
const settingsService = require('../services/settingsService');
const logger = require('../utils/logger');
const messageHandler = require('./messageHandler');

class CommandHandler {
    async handleInteraction(interaction) {
        if (!interaction.isCommand()) return;

        const { commandName } = interaction;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        try {
            // Get settings asynchronously
            const settings = await settingsService.getServerSettings(guildId);

            switch (commandName) {
                case 'agentic':
                    return this.handleAgenticCommand(interaction, settings);
                case 'model':
                    return this.handleModelCommand(interaction, settings);
                case 'settier':
                    return this.handleSetTierCommand(interaction, settings);
                case 'settings':
                    return this.handleSettingsCommand(interaction, settings);
                case 'test':
                    return this.handleTestCommand(interaction, settings);
                case 'setprovider':
                    return this.handleSetProviderCommand(interaction, settings);
                default:
                    return interaction.reply({
                        content: '❌ Unknown command',
                        ephemeral: true
                    });
            }
        } catch (error) {
            logger.error('Error handling interaction', {
                error: error.message,
                command: commandName,
                options: interaction.options?._hoistedOptions || [],
                userId,
                guildId
            });

            return interaction.reply({
                content: '❌ An error occurred while processing your command',
                ephemeral: true
            });
        }
    }

    async handleAgenticCommand(interaction, settings) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel first!',
                ephemeral: true
            });
        }

        // Toggle voice connection
        await messageHandler.handleMachineCommand(interaction, settings);
        return interaction.reply({
            content: '✅ Voice connection toggled',
            ephemeral: true
        });
    }

    async handleModelCommand(interaction, settings) {
        const model = interaction.options.getString('model');
        
        try {
            await settingsService.updateServerSettings(interaction.guild.id, { model });
            return interaction.reply({
                content: `✅ Model updated to ${model}`,
                ephemeral: true
            });
        } catch (error) {
            if (error.message.includes('model_not_allowed')) {
                return interaction.reply({
                    content: '❌ This model is not available in your current tier',
                    ephemeral: true
                });
            }
            throw error;
        }
    }

    async handleSetTierCommand(interaction, settings) {
        const tier = interaction.options.getString('tier');
        
        try {
            await settingsService.updateServerSettings(interaction.guild.id, { tier });
            return interaction.reply({
                content: `✅ Tier updated to ${tier}`,
                ephemeral: true
            });
        } catch (error) {
            throw error;
        }
    }

    async handleSettingsCommand(interaction, settings) {
        const embed = {
            color: 0x0099ff,
            title: 'Current Settings',
            fields: [
                { name: 'Tier', value: settings.tier || 'FREE', inline: true },
                { name: 'Model', value: settings.model || 'GPT35', inline: true },
                { name: 'TTS Provider', value: settings.ttsProvider || 'huggingface_facebook', inline: true },
                { name: 'Max Tokens', value: settings.maxTokens?.toString() || '100', inline: true },
                { name: 'Streaming', value: settings.streaming ? 'Enabled' : 'Disabled', inline: true }
            ]
        };

        return interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }

    async handleTestCommand(interaction, settings) {
        const feature = interaction.options.getString('feature');
        
        return interaction.reply({
            content: `🔄 Testing ${feature} feature...`,
            ephemeral: true
        });
    }

    async handleSetProviderCommand(interaction, settings) {
        const provider = interaction.options.getString('provider');
        
        try {
            await settingsService.updateServerSettings(interaction.guild.id, {
                ...settings,
                ttsProvider: provider
            });

            return interaction.reply({
                content: `✅ TTS provider set to ${provider}`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error setting TTS provider', {
                error: error.message,
                provider,
                guildId: interaction.guild.id
            });

            return interaction.reply({
                content: '❌ Failed to set TTS provider',
                ephemeral: true
            });
        }
    }

    // Legacy command handler for !machine command only
    async handleLegacyCommand(message) {
        if (message.content.toLowerCase() === '!machine') {
            const settings = await settingsService.getServerSettings(message.guild.id);
            return messageHandler.handleMachineCommand(message, settings);
        }
    }
}

module.exports = new CommandHandler();