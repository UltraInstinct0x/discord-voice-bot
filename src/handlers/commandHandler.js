const { SlashCommandBuilder } = require('@discordjs/builders');
const logger = require('../utils/logger');
const settingsService = require('../services/settingsService');
const { CONFIG } = require('../config/config');
const { getVoiceConnection, joinVoiceChannel } = require('@discordjs/voice');

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
                case 'agentic':
                    return this.handleAgenticCommand(interaction, settings);
                case 'model':
                    return this.handleModelCommand(interaction, settings);
                case 'settier':
                    return this.handleSetTierCommand(interaction, settings);
                case 'configure':
                    return this.handleConfigureCommand(interaction, settings);
                case 'setautojoin':
                    return this.handleSetAutoJoinCommand(interaction, settings);
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
                        value: (() => {
                            const provider = settings.ttsProvider || CONFIG.DEFAULT_SETTINGS.ttsProvider;
                            const providers = {
                                'tiktok': 'TikTok',
                                'huggingface_facebook': 'HuggingFace Facebook',
                                'huggingface_fastspeech': 'HuggingFace FastSpeech2',
                                'huggingface_coqui': 'HuggingFace Coqui',
                                'huggingface_indic': 'HuggingFace Indic',
                                'elevenlabs': 'ElevenLabs'
                            };
                            return providers[provider] || provider;
                        })(),
                        inline: true
                    },
                    {
                        name: 'AI Model',
                        value: (() => {
                            const model = settings.model || 'GPT35';
                            const models = {
                                'GPT35': 'GPT-3.5',
                                'GPT4': 'GPT-4',
                                'CLAUDE': 'Claude Sonnet',
                                'MIXTRAL': 'Mixtral-8x7B'
                            };
                            return models[model] || model;
                        })(),
                        inline: true
                    },
                    {
                        name: 'Subscription Tier',
                        value: settings.tier || 'FREE',
                        inline: true
                    },
                    {
                        name: 'Auto-Join Voice',
                        value: settings.autoJoin ? '✅ Enabled' : '❌ Disabled',
                        inline: true
                    },
                    {
                        name: 'Available Models',
                        value: (() => {
                            const tier = settings.tier || 'FREE';
                            const allowedModels = CONFIG.TIERS[tier]?.allowedModels || ['GPT35'];
                            return allowedModels.map(model => {
                                const models = {
                                    'GPT35': 'GPT-3.5',
                                    'GPT4': 'GPT-4',
                                    'CLAUDE': 'Claude Sonnet',
                                    'MIXTRAL': 'Mixtral-8x7B'
                                };
                                return models[model] || model;
                            }).join(', ');
                        })(),
                        inline: false
                    },
                    {
                        name: 'Admin',
                        value: settings.adminId ? `<@${settings.adminId}>` : 'Not set',
                        inline: true
                    },
                    {
                        name: 'Allowed Users',
                        value: settings.allowedUsers?.size > 0 
                            ? Array.from(settings.allowedUsers).map(id => `<@${id}>`).join(', ')
                            : 'All users allowed',
                        inline: false
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
        const isPremium = settings.tier === 'PREMIUM';
        if (!isPremium && (provider === 'elevenlabs')) {
            return interaction.reply({
                content: 'ElevenLabs is only available for premium users.',
                ephemeral: true
            });
        }

        try {
            // Update settings using settingsService
            await settingsService.updateServerSettings(interaction.guildId, {
                ttsProvider: provider
            });

            const providerName = {
                'tiktok': 'TikTok',
                'huggingface_facebook': 'HuggingFace Facebook',
                'elevenlabs': 'ElevenLabs',
                'huggingface_fastspeech': 'HuggingFace FastSpeech2'
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

    async handleAgenticCommand(interaction, settings) {
        try {
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({
                    content: 'You need to be in a voice channel first!',
                    ephemeral: true
                });
            }

            const connection = getVoiceConnection(interaction.guildId);
            
            if (connection) {
                // Bot is in a voice channel, so leave
                connection.destroy();
                return interaction.reply({
                    content: 'Left the voice channel.',
                    ephemeral: true
                });
            } else {
                // Bot is not in a voice channel, so join
                try {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: interaction.guildId,
                        adapterCreator: interaction.guild.voiceAdapterCreator,
                    });

                    return interaction.reply({
                        content: `Joined ${voiceChannel.name}!`,
                        ephemeral: true
                    });
                } catch (error) {
                    logger.error('Failed to join voice channel', {
                        error: error.message,
                        channelId: voiceChannel.id,
                        guildId: interaction.guildId
                    });
                    return interaction.reply({
                        content: 'Failed to join the voice channel. Please try again.',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            logger.error('Error handling agentic command', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to execute agentic command',
                ephemeral: true
            });
        }
    }

    async handleModelCommand(interaction, settings) {
        try {
            const model = interaction.options.getString('model');
            const validModels = ['GPT35', 'GPT4', 'CLAUDE', 'MIXTRAL'];
            
            if (!validModels.includes(model)) {
                return interaction.reply({
                    content: 'Invalid model selected.',
                    ephemeral: true
                });
            }

            await settingsService.updateServerSettings(interaction.guildId, { model });
            
            return interaction.reply({
                content: `AI model has been set to ${model}`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error setting AI model', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to set AI model',
                ephemeral: true
            });
        }
    }

    async handleSetTierCommand(interaction, settings) {
        try {
            const tier = interaction.options.getString('tier');
            const validTiers = ['FREE', 'PREMIUM'];
            
            if (!validTiers.includes(tier)) {
                return interaction.reply({
                    content: 'Invalid tier selected. Please choose either Free or Premium.',
                    ephemeral: true
                });
            }

            await settingsService.updateServerSettings(interaction.guildId, { tier });
            
            return interaction.reply({
                content: `Your tier has been set to ${tier}`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error setting tier', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to set tier',
                ephemeral: true
            });
        }
    }

    async handleConfigureCommand(interaction, settings) {
        try {
            // For now, just show current configuration options
            const configEmbed = {
                color: 0x0099ff,
                title: 'Bot Configuration',
                description: 'Use the following commands to configure the bot:',
                fields: [
                    {
                        name: '/setprovider',
                        value: 'Set the TTS provider',
                        inline: true
                    },
                    {
                        name: '/model',
                        value: 'Set the AI model',
                        inline: true
                    },
                    {
                        name: '/settier',
                        value: 'Set your subscription tier',
                        inline: true
                    }
                ],
                timestamp: new Date()
            };

            return interaction.reply({
                embeds: [configEmbed],
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error handling configure command', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to show configuration options',
                ephemeral: true
            });
        }
    }

    async handleSetAutoJoinCommand(interaction, settings) {
        try {
            const enabled = interaction.options.getBoolean('enabled');
            await settingsService.updateServerSettings(interaction.guildId, {
                autoJoin: enabled
            });

            return interaction.reply({
                embeds: [{
                    color: 0x0099ff,
                    title: `Auto-Join ${enabled ? 'Enabled' : 'Disabled'} 🎙️`,
                    description: enabled ? 
                        "I'll automatically join your voice channel when you mention me!" :
                        "I'll wait for the !machine or /agentic command before joining voice.",
                    fields: [
                        {
                            name: "How to Join",
                            value: enabled ? 
                                "Just mention me while in a voice channel!" :
                                "Use !machine or /agentic when you want me to join",
                            inline: true
                        }
                    ]
                }],
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error setting auto-join', {
                error: error.message,
                guildId: interaction.guildId
            });
            return interaction.reply({
                content: 'Failed to update auto-join setting',
                ephemeral: true
            });
        }
    }
}

module.exports = new CommandHandler();