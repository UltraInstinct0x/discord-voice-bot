const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const ServerSettings = require('../models/ServerSettings');
const { CONFIG } = require('../config/config');

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
            const jsonData = JSON.parse(data);
            return ServerSettings.fromJSON(jsonData);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return new ServerSettings(guildId);
            }
            throw error;
        }
    }

    async saveSettings(guildId, settings) {
        const filepath = this.getSettingsPath(guildId);
        try {
            await fs.writeFile(filepath, JSON.stringify(settings.toJSON(), null, 2));
            logger.info('Server settings saved', {
                guildId,
                settingsSize: JSON.stringify(settings).length,
                hasAdmin: !!settings.adminId,
                allowedUsers: settings.allowedUsers?.size || 0
            });
        } catch (error) {
            logger.error('Error saving settings', {
                error: error.message,
                guildId
            });
            throw error;
        }
    }

    getDefaultSettings(guildId) {
        return new ServerSettings(guildId);
    }

    async getServerSettings(guildId) {
        if (!this.settings.has(guildId)) {
            const settings = await this.loadSettings(guildId);
            this.settings.set(guildId, settings);
        }
        return this.settings.get(guildId);
    }

    async setTTSProvider(guildId, provider) {
        try {
            // Validate provider
            if (!Object.values(CONFIG.TTS_PROVIDERS).includes(provider)) {
                throw new Error(`Invalid TTS provider: ${provider}`);
            }

            const settings = await this.getServerSettings(guildId);
            settings.setTTSProvider(provider);
            await this.saveSettings(guildId, settings);
            
            logger.info('TTS provider updated', {
                guildId,
                provider
            });

            return settings;
        } catch (error) {
            logger.error('Failed to set TTS provider', {
                error: error.message,
                provider,
                guildId
            });
            throw error;
        }
    }

    async updateServerSettings(guildId, updates) {
        const settings = await this.getServerSettings(guildId);
        
        // Update settings using appropriate setters
        Object.entries(updates).forEach(([key, value]) => {
            const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}`;
            if (typeof settings[setterName] === 'function') {
                settings[setterName](value);
            } else if (typeof settings[key] !== 'undefined') {
                settings[key] = value;
            }
        });
        
        await this.saveSettings(guildId, settings);
        // Update the cache
        this.settings.set(guildId, settings);
        return settings;
    }

    async initializeGuildSettings(guildId, adminId) {
        const settings = new ServerSettings(guildId);
        settings.setAdmin(adminId);
        await this.saveSettings(guildId, settings);
        this.settings.set(guildId, settings);
        return settings;
    }

    async transferAdmin(guildId, currentAdminId, newAdminId) {
        const settings = await this.getServerSettings(guildId);
        
        if (settings.adminId !== currentAdminId) {
            throw new Error('unauthorized');
        }
        
        settings.setAdmin(newAdminId);
        await this.saveSettings(guildId, settings);
        return settings;
    }

    async setModel(guildId, model) {
        try {
            const validModels = ['GPT35', 'GPT4', 'CLAUDE', 'MIXTRAL'];
            if (!validModels.includes(model)) {
                throw new Error(`Invalid AI model: ${model}`);
            }

            const settings = await this.getServerSettings(guildId);
            settings.model = model;
            await this.saveSettings(guildId, settings);
            
            logger.info('AI model updated', {
                guildId,
                model
            });

            return settings;
        } catch (error) {
            logger.error('Failed to set AI model', {
                error: error.message,
                model,
                guildId
            });
            throw error;
        }
    }

    async setTier(guildId, tier) {
        try {
            const validTiers = ['FREE', 'PREMIUM'];
            if (!validTiers.includes(tier)) {
                throw new Error(`Invalid tier: ${tier}`);
            }

            const settings = await this.getServerSettings(guildId);
            settings.tier = tier;
            await this.saveSettings(guildId, settings);
            
            logger.info('Tier updated', {
                guildId,
                tier
            });

            return settings;
        } catch (error) {
            logger.error('Failed to set tier', {
                error: error.message,
                tier,
                guildId
            });
            throw error;
        }
    }
}

module.exports = new SettingsService();