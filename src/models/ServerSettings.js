class ServerSettings {
    constructor(guildId) {
        this.guildId = guildId;
        this.channelId = null;
        this.adminId = null;
        this.allowedUsers = new Set();
        this.isListeningToEveryone = false;
        this.isMuted = false;
        this.lastActive = Date.now();
        this.voiceSettings = {
            language: 'en',
            voiceId: 'default'
        };
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

    setAdmin(userId) {
        this.adminId = userId;
        this.lastActive = Date.now();
    }

    setChannel(channelId) {
        this.channelId = channelId;
        this.lastActive = Date.now();
    }

    setListeningMode(listenToEveryone) {
        this.isListeningToEveryone = listenToEveryone;
        this.lastActive = Date.now();
    }

    setMuted(muted) {
        this.isMuted = muted;
        this.lastActive = Date.now();
    }

    updateVoiceSettings(settings) {
        this.voiceSettings = { ...this.voiceSettings, ...settings };
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
            voiceSettings: this.voiceSettings
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
        settings.voiceSettings = data.voiceSettings;
        return settings;
    }
}