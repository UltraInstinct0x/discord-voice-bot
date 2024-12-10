const ElevenLabs = require("elevenlabs-node");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const os = require("os");
const logger = require("../utils/logger");
const { CONFIG, RESPONSE_CONFIG } = require("../config/config");

class TTSService {
  constructor() {
    this.voice = new ElevenLabs({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  async generateTTS(text, provider) {
    try {
      switch (provider) {
        case CONFIG.TTS_PROVIDERS.ELEVENLABS:
          return await this.elevenLabsTTS(text);
        case CONFIG.TTS_PROVIDERS.HUGGINGFACE_FACEBOOK:
        case CONFIG.TTS_PROVIDERS.HUGGINGFACE_FASTSPEECH:
        case CONFIG.TTS_PROVIDERS.HUGGINGFACE_COQUI:
        case CONFIG.TTS_PROVIDERS.HUGGINGFACE_INDIC:
          const model = CONFIG.TTS_MODELS[provider];
          const retryMessage = RESPONSE_CONFIG.RETRY_MESSAGES[
            Math.floor(Math.random() * RESPONSE_CONFIG.RETRY_MESSAGES.length)
          ];
          try {
            return await this.huggingFaceTTS(text, model, 2);
          } catch (error) {
            // If HuggingFace fails after retries, try with a retry message
            logger.info("Attempting with retry message after HuggingFace failure");
            return await this.huggingFaceTTS(retryMessage, model, 1);
          }
        default:
          throw new Error(`Unsupported TTS provider: ${provider}`);
      }
    } catch (error) {
      logger.error(`TTS failed for provider ${provider}:`, { error: error.message });
      // If all attempts fail, try one last time with a simple message
      const fallbackMessage = "Processing your request...";
      try {
        // Try with facebook/mms-tts-eng as last resort
        return await this.huggingFaceTTS(fallbackMessage, CONFIG.TTS_MODELS.huggingface_facebook, 1);
      } catch (finalError) {
        logger.error("Final fallback TTS attempt failed:", { error: finalError.message });
        throw error;
      }
    }
  }

  async elevenLabsTTS(text) {
    try {
      const tmpFile = path.join(os.tmpdir(), `${Date.now()}_elevenlabs.mp3`);
      const audio = await this.voice.textToSpeech({
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        text,
      });

      await fs.promises.writeFile(tmpFile, audio);
      return tmpFile;
    } catch (error) {
      logger.error("ElevenLabs TTS failed:", { error: error.message });
      throw error;
    }
  }

  async huggingFaceTTS(text, model, maxRetries = 2) {
    let retries = 0;
    while (retries <= maxRetries) {
      try {
        const tmpFile = path.join(os.tmpdir(), `${Date.now()}_huggingface.wav`);
        const response = await fetch(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
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
        await fs.promises.writeFile(tmpFile, buffer);
        return tmpFile;
      } catch (error) {
        retries++;
        if (retries > maxRetries) {
          logger.error("HuggingFace TTS failed after retries:", { error: error.message, model });
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }
}

module.exports = new TTSService();
