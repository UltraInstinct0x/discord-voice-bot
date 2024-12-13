const { PERMISSIONS } = require('../config/permissions');
const settingsService = require('../services/settingsService');
const logger = require('../utils/logger');

class CommandHandler {
    async handleCommand(message, command, args) {
        const guildId = message.guild.id;
        const userId = message.author.id;
        const settings = settingsService.getServerSettings(guildId);

        switch (command) {
            case 'listen':
                return this.handleListenCommand(message, args, settings);
            case 'config':
                return this.handleConfigCommand(message, settings);
            case 'transfer-admin':
                return this.handleTransferAdminCommand(message, args, settings);
            case 'status':
                return this.handleStatusCommand(message, settings);
            case 'mute':
            case 'unmute':
                return this.handleMuteCommand(message, command === 'mute', settings);
            default:
                return message.reply('Unknown command. Use !help for available commands.');
        }
    }

    async handleListenCommand(message, args, settings) {
        if (!this.checkAdminPermission(message, settings)) return;

        const subcommand = args[0]?.toLowerCase();
        switch (subcommand) {
            case 'add':
                const userToAdd = message.mentions.users.first();
                if (!userToAdd) return message.reply(PERMISSIONS.ERRORS.INVALID_USER);
                
                await settingsService.updateServerSettings(settings.guildId, (settings) => {
                    settings.addAllowedUser(userToAdd.id);
                });
                return message.reply(`${PERMISSIONS.SUCCESS.USER_ADDED} <@${userToAdd.id}>`);

            case 'remove':
                const userToRemove = message.mentions.users.first();
                if (!userToRemove) return message.reply(PERMISSIONS.ERRORS.INVALID_USER);
                
                await settingsService.updateServerSettings(settings.guildId, (settings) => {
                    settings.removeAllowedUser(userToRemove.id);
                });
                return message.reply(`${PERMISSIONS.SUCCESS.USER_REMOVED} <@${userToRemove.id}>`);

            case 'everyone':
                await settingsService.updateServerSettings(settings.guildId, (settings) => {
                    settings.setListeningMode(true);
                });
                return message.reply(PERMISSIONS.SUCCESS.LISTENING_EVERYONE);

            case 'whitelist':
                await settingsService.updateServerSettings(settings.guildId, (settings) => {
                    settings.setListeningMode(false);
                });
                return message.reply(PERMISSIONS.SUCCESS.LISTENING_WHITELIST);

            default:
                return message.reply('Available subcommands: add @user, remove @user, everyone, whitelist');
        }
    }

    async handleConfigCommand(message, settings) {
        if (!this.checkAdminPermission(message, settings)) return;

        const allowedUsers = Array.from(settings.allowedUsers)
            .map(id => `<@${id}>`)
            .join(', ');

        return message.reply({
            embeds: [{
                color: 0x0099ff,
                title: 'Voice Bot Configuration',
                fields: [
                    {
                        name: 'Admin',
                        value: settings.adminId ? `<@${settings.adminId}>` : 'None'
                    },
                    {
                        name: 'Listening Mode',
                        value: settings.isListeningToEveryone ? 'Everyone' : 'Whitelist'
                    },
                    {
                        name: 'Allowed Users',
                        value: allowedUsers || 'None'
                    },
                    {
                        name: 'Status',
                        value: settings.isMuted ? 'Muted' : 'Active'
                    },
                    {
                        name: 'Voice Settings',
                        value: `Language: ${settings.voiceSettings.language}\nVoice ID: ${settings.voiceSettings.voiceId}`
                    }
                ]
            }]
        });
    }

    async handleTransferAdminCommand(message, args, settings) {
        if (!this.checkAdminPermission(message, settings)) return;

        const newAdmin = message.mentions.users.first();
        if (!newAdmin) return message.reply(PERMISSIONS.ERRORS.INVALID_USER);

        await settingsService.updateServerSettings(settings.guildId, (settings) => {
            settings.setAdmin(newAdmin.id);
        });
        return message.reply(`${PERMISSIONS.SUCCESS.ADMIN_TRANSFERRED} <@${newAdmin.id}>`);
    }

    async handleStatusCommand(message, settings) {
        const allowedStatus = settings.isUserAllowed(message.author.id) ? 'Allowed' : 'Not Allowed';
        const adminStatus = settings.adminId === message.author.id ? 'Yes' : 'No';

        return message.reply({
            embeds: [{
                color: 0x0099ff,
                title: 'Your Voice Bot Status',
                fields: [
                    {
                        name: 'Permission Status',
                        value: allowedStatus
                    },
                    {
                        name: 'Admin Status',
                        value: adminStatus
                    }
                ]
            }]
        });
    }

    async handleMuteCommand(message, mute, settings) {
        if (!this.checkAdminPermission(message, settings)) return;

        await settingsService.updateServerSettings(settings.guildId, (settings) => {
            settings.setMuted(mute);
        });
        return message.reply(mute ? PERMISSIONS.SUCCESS.MUTED : PERMISSIONS.SUCCESS.UNMUTED);
    }

    checkAdminPermission(message, settings) {
        if (settings.adminId !== message.author.id) {
            message.reply(PERMISSIONS.ERRORS.NOT_ADMIN);
            return false;
        }
        return true;
    }
}

module.exports = new CommandHandler();