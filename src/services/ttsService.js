const ElevenLabs = require("elevenlabs-node");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config/config");
const logger = require("../utils/logger");

class TTSService {
  constructor() {
    this.elevenlabs = new ElevenLabs({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  async generateTTS(text, provider) {
    logger.info('Generating TTS', { 
      text: text.substring(0, 100), 
      provider 
    });

    try {
      switch (provider) {
        case CONFIG.TTS_PROVIDERS.ELEVENLABS:
          return await this.elevenLabsTTS(text);
        case CONFIG.TTS_PROVIDERS.HUGGINGFACE:
          return await this.huggingFaceTTS(text);
        default:
          throw new Error(`Unsupported TTS provider: ${provider}`);
      }
    } catch (error) {
      logger.error('Error generating TTS', { 
        error: error.message, 
        provider 
      });
      throw error;
    }
  }

  async elevenLabsTTS(text) {
    const audioPath = path.join(__dirname, '../../temp', `${Date.now()}.mp3`);
    await this.elevenlabs.textToSpeech({
      voiceId: process.env.ELEVENLABS_VOICE_ID,
      textInput: text,
      outputPath: audioPath,
    });
    return audioPath;
  }

  async huggingFaceTTS(text, maxRetries = 3) {
    const audioPath = path.join(__dirname, '../../temp', `${Date.now()}.wav`);
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(
          "https://api-inference.huggingface.co/models/facebook/mms-tts-eng",
          {
            headers: {
              Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({ inputs: text }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const buffer = await response.buffer();
        fs.writeFileSync(audioPath, buffer);
        return audioPath;
      } catch (error) {
        attempt++;
        if (attempt === maxRetries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
}

module.exports = new TTSService();
