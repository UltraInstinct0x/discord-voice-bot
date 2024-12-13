const prism = require('prism-media');
const { Transform } = require('stream');
const { CONFIG } = require('../config/config');

class AudioPreprocessor extends Transform {
  constructor(options = {}) {
    super(options);
    this.sampleRate = CONFIG.AUDIO_SETTINGS.sampleRate;
    this.channels = CONFIG.AUDIO_SETTINGS.channels;
    this.buffer = Buffer.alloc(0);
    this.silenceThreshold = CONFIG.AUDIO_SETTINGS.noiseThreshold;
    this.preprocessing = CONFIG.AUDIO_SETTINGS.preprocessing;
  }

  _transform(chunk, encoding, callback) {
    try {
      if (this.preprocessing.normalize) {
        chunk = this.normalizeAudio(chunk);
      }
      
      if (this.preprocessing.removeNoise) {
        chunk = this.removeNoise(chunk);
      }
      
      if (this.preprocessing.trimSilence) {
        chunk = this.trimSilence(chunk);
      }
      
      this.push(chunk);
      callback();
    } catch (error) {
      callback(error);
    }
  }

  normalizeAudio(buffer) {
    const samples = new Int16Array(buffer.buffer);
    let maxSample = 0;
    
    // Find maximum sample value
    for (let i = 0; i < samples.length; i++) {
      maxSample = Math.max(maxSample, Math.abs(samples[i]));
    }
    
    if (maxSample === 0) return buffer;
    
    // Normalize samples
    const normalizationFactor = 32767 / maxSample;
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.round(samples[i] * normalizationFactor);
    }
    
    return Buffer.from(samples.buffer);
  }

  removeNoise(buffer) {
    const samples = new Int16Array(buffer.buffer);
    const threshold = this.silenceThreshold;
    
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) {
        samples[i] = 0;
      }
    }
    
    return Buffer.from(samples.buffer);
  }

  trimSilence(buffer) {
    const samples = new Int16Array(buffer.buffer);
    let start = 0;
    let end = samples.length - 1;
    
    // Find start of audio
    while (start < samples.length && Math.abs(samples[start]) < this.silenceThreshold) {
      start++;
    }
    
    // Find end of audio
    while (end > start && Math.abs(samples[end]) < this.silenceThreshold) {
      end--;
    }
    
    if (start >= end) return Buffer.alloc(0);
    
    return Buffer.from(samples.slice(start, end + 1).buffer);
  }
}

module.exports = AudioPreprocessor;