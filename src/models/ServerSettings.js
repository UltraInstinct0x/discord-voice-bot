const { CONFIG } = require('../config/config');

class ServerSettings {
    constructor(guildId) {
        this.guildId = guildId;
        this.channelId = null;
        this.adminId = null;
        this.allowedUsers = new Set();
        this.isListeningToEveryone = false;
        this.isMuted = false;
        this.lastActive = Date.now();
        this.ttsProvider = CONFIG.DEFAULT_SETTINGS.ttsProvider || 'tiktok';
        this.language = CONFIG.DEFAULT_SETTINGS.language || 'en';
        this.voiceCommand = CONFIG.DEFAULT_SETTINGS.voiceCommand || false;
        this.autoJoin = CONFIG.DEFAULT_SETTINGS.autoJoin || false;
    }

    setTTSProvider(provider) {
        this.ttsProvider = provider;
        this.lastActive = Date.now();
    }

    setLanguage(language) {
        this.language = language;
        this.lastActive = Date.now();
    }

    setVoiceCommand(enabled) {
        this.voiceCommand = enabled;
        this.lastActive = Date.now();
    }

    setAutoJoin(enabled) {
        this.autoJoin = enabled;
        this.lastActive = Date.now();
    }

    setChannel(channelId) {
        this.channelId = channelId;
        this.lastActive = Date.now();
    }

    setAdmin(userId) {
        this.adminId = userId;
        this.lastActive = Date.now();
    }

    addAllowedUser(userId) {
        this.allowedUsers.add(userId);
        this.lastActive = Date.now();
    }

    removeAllowedUser(userId) {
        this.allowedUsers.delete(userId);
        this.lastActive = Date.now();
    }

    isUserAllowed(userId) {
        return this.isListeningToEveryone || 
               this.allowedUsers.has(userId) || 
               userId === this.adminId;
    }

    setListeningMode(listenToEveryone) {
        this.isListeningToEveryone = listenToEveryone;
        this.lastActive = Date.now();
    }

    setMuted(muted) {
        this.isMuted = muted;
        this.lastActive = Date.now();
    }

    toJSON() {
        return {
            guildId: this.guildId,
            channelId: this.channelId,
            adminId: this.adminId,
            allowedUsers: Array.from(this.allowedUsers),
            isListeningToEveryone: this.isListeningToEveryone,
            isMuted: this.isMuted,
            lastActive: this.lastActive,
            ttsProvider: this.ttsProvider,
            language: this.language,
            voiceCommand: this.voiceCommand,
            autoJoin: this.autoJoin
        };
    }

    static fromJSON(data) {
        const settings = new ServerSettings(data.guildId);
        settings.channelId = data.channelId;
        settings.adminId = data.adminId;
        settings.allowedUsers = new Set(data.allowedUsers);
        settings.isListeningToEveryone = data.isListeningToEveryone;
        settings.isMuted = data.isMuted;
        settings.lastActive = data.lastActive;
        settings.ttsProvider = data.ttsProvider || CONFIG.DEFAULT_SETTINGS.ttsProvider;
        settings.language = data.language || CONFIG.DEFAULT_SETTINGS.language;
        settings.voiceCommand = data.voiceCommand || CONFIG.DEFAULT_SETTINGS.voiceCommand;
        settings.autoJoin = data.autoJoin || CONFIG.DEFAULT_SETTINGS.autoJoin;
        return settings;
    }
}

module.exports = ServerSettings;