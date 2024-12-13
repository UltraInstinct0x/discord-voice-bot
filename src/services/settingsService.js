const fs = require('fs').promises;
const path = require('path');
const ServerSettings = require('../models/ServerSettings');
const logger = require('../utils/logger');
const { PERMISSIONS } = require('../config/permissions');

class SettingsService {
    constructor() {
        this.settings = new Map();
        this.settingsPath = path.join(__dirname, '../../data/settings');
    }

    async initialize() {
        try {
            await fs.mkdir(this.settingsPath, { recursive: true });
            await this.loadAllSettings();
            this.startCleanupInterval();
        } catch (error) {
            logger.error('Failed to initialize settings service:', error);
            throw error;
        }
    }

    async loadAllSettings() {
        try {
            const files = await fs.readdir(this.settingsPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const guildId = file.replace('.json', '');
                    await this.loadServerSettings(guildId);
                }
            }
        } catch (error) {
            logger.error('Error loading settings:', error);
        }
    }

    async loadServerSettings(guildId) {
        try {
            const filePath = path.join(this.settingsPath, `${guildId}.json`);
            const data = await fs.readFile(filePath, 'utf8');
            const settingsData = JSON.parse(data);
            this.settings.set(guildId, ServerSettings.fromJSON(settingsData));
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error(`Error loading settings for guild ${guildId}:`, error);
            }
            return null;
        }
    }

    async saveServerSettings(guildId) {
        const settings = this.settings.get(guildId);
        if (!settings) return;

        try {
            const filePath = path.join(this.settingsPath, `${guildId}.json`);
            await fs.writeFile(filePath, JSON.stringify(settings.toJSON(), null, 2));
        } catch (error) {
            logger.error(`Error saving settings for guild ${guildId}:`, error);
        }
    }

    getServerSettings(guildId) {
        if (!this.settings.has(guildId)) {
            const settings = new ServerSettings(guildId);
            this.settings.set(guildId, settings);
            this.saveServerSettings(guildId);
        }
        return this.settings.get(guildId);
    }

    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [guildId, settings] of this.settings.entries()) {
                if (now - settings.lastActive > PERMISSIONS.TIMEOUTS.ADMIN_INACTIVITY) {
                    settings.setAdmin(null);
                    this.saveServerSettings(guildId);
                }
            }
        }, PERMISSIONS.TIMEOUTS.ADMIN_INACTIVITY);
    }

    isUserAdmin(guildId, userId) {
        const settings = this.getServerSettings(guildId);
        return settings.adminId === userId;
    }

    async updateServerSettings(guildId, updateFn) {
        const settings = this.getServerSettings(guildId);
        await updateFn(settings);
        await this.saveServerSettings(guildId);
        return settings;
    }

    async cleanupServer(guildId) {
        try {
            const filePath = path.join(this.settingsPath, `${guildId}.json`);
            await fs.unlink(filePath);
            this.settings.delete(guildId);
        } catch (error) {
            logger.error(`Error cleaning up settings for guild ${guildId}:`, error);
        }
    }
}

module.exports = new SettingsService();