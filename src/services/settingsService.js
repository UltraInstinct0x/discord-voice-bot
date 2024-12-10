const { CONFIG } = require("../config/config");
const logger = require("../utils/logger");

class SettingsService {
  constructor() {
    this.userSettings = new Map();
  }

  getUserSettings(userId) {
    const defaultSettings = {
      tier: "FREE",
      ttsProvider: CONFIG.TIERS.FREE.ttsProvider,
      streaming: CONFIG.TIERS.FREE.streaming,
      model: CONFIG.TIERS.FREE.allowedModels[0],
      maxTokens: CONFIG.TIERS.FREE.maxTokens
    };

    if (!this.userSettings.has(userId)) {
      this.userSettings.set(userId, defaultSettings);
    }
    return this.userSettings.get(userId);
  }

  updateUserSettings(userId, settings) {
    this.userSettings.set(userId, settings);
    return this.userSettings.get(userId);
  }
}

module.exports = new SettingsService();
