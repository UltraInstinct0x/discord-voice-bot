const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class SettingsService {
    constructor() {
        this.settings = new Map();
        this.settingsPath = path.join(process.cwd(), 'data', 'settings');
    }

    async initialize() {
        try {
            await fs.mkdir(this.settingsPath, { recursive: true });
        } catch (error) {
            logger.error('Error creating settings directory', { error: error.message });
        }
    }

    getSettingsPath(guildId) {
        return path.join(this.settingsPath, `${guildId}.json`);
    }

    async loadSettings(guildId) {
        const filepath = this.getSettingsPath(guildId);
        try {
            const data = await fs.readFile(filepath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return this.getDefaultSettings();
            }
            throw error;
        }
    }

    async saveSettings(guildId, settings) {
        const filepath = this.getSettingsPath(guildId);
        try {
            await fs.writeFile(filepath, JSON.stringify(settings, null, 2));
            logger.info('Server settings saved', {
                guildId,
                settingsSize: JSON.stringify(settings).length,
                hasAdmin: !!settings.adminId,
                allowedUsers: settings.allowedUsers?.length || 0
            });
        } catch (error) {
            logger.error('Error saving settings', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }

    getDefaultSettings() {
        return {
            tier: 'FREE',
            model: 'GPT35',
            ttsProvider: 'huggingface_facebook',
            maxTokens: 100,
            streaming: false,
            allowedUsers: [],
            adminId: null
        };
    }

    async getServerSettings(guildId) {
        if (!this.settings.has(guildId)) {
            const settings = await this.loadSettings(guildId);
            this.settings.set(guildId, settings);
        }
        return this.settings.get(guildId);
    }

    async updateServerSettings(guildId, updates) {
        const currentSettings = await this.getServerSettings(guildId);
        const newSettings = { ...currentSettings, ...updates };
        
        // Validate settings
        if (updates.model) {
            if (!this.isModelAllowedForTier(updates.model, newSettings.tier)) {
                throw new Error('model_not_allowed');
            }
        }
        
        await this.saveSettings(guildId, newSettings);
        this.settings.set(guildId, newSettings);
        return newSettings;
    }

    isModelAllowedForTier(model, tier) {
        const tierModels = {
            'FREE': ['GPT35'],
            'PREMIUM': ['GPT35', 'GPT4', 'CLAUDE', 'MIXTRAL']
        };
        return tierModels[tier]?.includes(model) || false;
    }

    async initializeGuildSettings(guildId, adminId) {
        const settings = this.getDefaultSettings();
        settings.adminId = adminId;
        await this.saveSettings(guildId, settings);
        this.settings.set(guildId, settings);
        
        logger.info('Initialized guild settings with admin', {
            guildId,
            adminId
        });
        
        return settings;
    }

    async transferAdmin(guildId, currentAdminId, newAdminId) {
        const settings = await this.getServerSettings(guildId);
        
        if (settings.adminId !== currentAdminId) {
            throw new Error('not_admin');
        }
        
        settings.adminId = newAdminId;
        await this.saveSettings(guildId, settings);
        
        logger.info('Admin rights transferred', {
            guildId,
            previousAdmin: currentAdminId,
            newAdmin: newAdminId
        });
        
        return settings;
    }
}

module.exports = new SettingsService();