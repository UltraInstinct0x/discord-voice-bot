const { CONFIG } = require('../config/config');

class VoiceActivityDetector {
  constructor() {
    this.config = CONFIG.AUDIO_SETTINGS.vadSettings;
    this.smoothing = this.config.smoothing;
    this.threshold = this.config.threshold;
    this.speaking = false;
    this.energy = 0;
  }

  processAudio(buffer) {
    if (!this.config.enabled) return true;

    const samples = new Int16Array(buffer.buffer);
    let energy = 0;
    
    // Calculate signal energy
    for (let i = 0; i < samples.length; i++) {
      energy += (samples[i] * samples[i]) / 32768.0;
    }
    energy /= samples.length;
    
    // Smooth energy value
    this.energy = (this.energy * this.smoothing) + (energy * (1 - this.smoothing));
    
    // Update speaking state
    this.speaking = this.energy > this.threshold;
    
    return this.speaking;
  }

  reset() {
    this.speaking = false;
    this.energy = 0;
  }
}

module.exports = VoiceActivityDetector;