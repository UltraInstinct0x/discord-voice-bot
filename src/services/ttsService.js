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
    this.currentAttempt = 0;
    this.totalAttempts = 0;
  }

  async generateTTS(text, provider) {
    this.currentAttempt = 0;
    this.totalAttempts = 0;

    logger.info('Starting TTS generation', { 
      text: text.substring(0, 100), 
      requestedProvider: provider,
      availableProviders: Object.values(CONFIG.TTS_PROVIDERS)
    });

    // Get the fallback order starting from the requested provider
    const fallbackOrder = this.getFallbackOrder(provider);
    let lastError = null;

    logger.info('TTS fallback order', {
      fallbackOrder,
      totalProviders: fallbackOrder.length
    });

    for (const currentProvider of fallbackOrder) {
      this.currentAttempt++;
      try {
        logger.info(`[Attempt ${this.currentAttempt}] Trying provider: ${currentProvider}`, {
          provider: currentProvider,
          model: CONFIG.TTS_MODELS[currentProvider] || 'ElevenLabs',
          attemptNumber: this.currentAttempt,
          totalProvidersTried: this.currentAttempt,
          remainingProviders: fallbackOrder.slice(fallbackOrder.indexOf(currentProvider) + 1)
        });
        
        if (currentProvider === CONFIG.TTS_PROVIDERS.ELEVENLABS) {
          return await this.elevenLabsTTS(text);
        } else {
          return await this.huggingFaceTTS(text, currentProvider);
        }
      } catch (error) {
        lastError = error;
        this.totalAttempts++;
        
        const nextProvider = fallbackOrder[fallbackOrder.indexOf(currentProvider) + 1];
        logger.warn(`[Attempt ${this.currentAttempt}] Provider ${currentProvider} failed`, {
          error: error.message,
          currentProvider,
          nextProvider: nextProvider || 'none',
          totalAttempts: this.totalAttempts,
          remainingProviders: fallbackOrder.slice(fallbackOrder.indexOf(currentProvider) + 1)
        });

        // If this was the last provider, log a summary
        if (!nextProvider) {
          logger.error('All TTS providers failed - Summary', {
            totalAttempts: this.totalAttempts,
            triedProviders: fallbackOrder,
            finalError: error.message
          });
        }
      }
    }

    throw new Error(`All TTS providers failed after ${this.totalAttempts} attempts. Last error: ${lastError?.message}`);
  }

  getFallbackOrder(requestedProvider) {
    const fallbackOrder = [...CONFIG.TTS_FALLBACK_ORDER];
    
    // If the requested provider is not the first in fallback order,
    // move it to the front
    if (requestedProvider !== fallbackOrder[0]) {
      const index = fallbackOrder.indexOf(requestedProvider);
      if (index !== -1) {
        fallbackOrder.splice(index, 1);
        fallbackOrder.unshift(requestedProvider);
      }
    }

    logger.info('Generated fallback order', {
      requestedProvider,
      fallbackOrder
    });

    return fallbackOrder;
  }

  async elevenLabsTTS(text) {
    const startTime = Date.now();
    logger.info('[ElevenLabs] Starting TTS generation');
    
    const audioPath = path.join(__dirname, '../../temp', `${Date.now()}.mp3`);
    try {
      await this.elevenlabs.textToSpeech({
        voiceId: process.env.ELEVENLABS_VOICE_ID,
        textInput: text,
        outputPath: audioPath,
      });
      
      const duration = Date.now() - startTime;
      logger.info('[ElevenLabs] Successfully generated TTS', { 
        audioPath,
        durationMs: duration
      });
      
      return audioPath;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('[ElevenLabs] Failed to generate TTS', {
        error: error.message,
        stack: error.stack,
        durationMs: duration
      });
      throw error;
    }
  }

  async huggingFaceTTS(text, provider, maxRetries = 2) {
    const startTime = Date.now();
    const audioPath = path.join(__dirname, '../../temp', `${Date.now()}.wav`);
    const model = CONFIG.TTS_MODELS[provider];
    
    if (!model) {
      throw new Error(`No model configured for provider: ${provider}`);
    }

    logger.info(`[${provider}] Starting TTS generation`, {
      model,
      maxRetries,
      attempt: 1
    });

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      this.totalAttempts++;
      
      try {
        logger.info(`[${provider}] Attempt ${attempt + 1}/${maxRetries}`, { 
          model,
          totalAttempts: this.totalAttempts
        });
        
        const response = await fetch(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({ inputs: text }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
        }

        const buffer = await response.buffer();
        fs.writeFileSync(audioPath, buffer);
        
        const duration = Date.now() - startTime;
        logger.info(`[${provider}] Successfully generated TTS`, {
          model,
          audioPath,
          attempt: attempt + 1,
          totalAttempts: this.totalAttempts,
          durationMs: duration
        });
        
        return audioPath;
      } catch (error) {
        lastError = error;
        const attemptDuration = Date.now() - attemptStartTime;
        
        logger.warn(`[${provider}] Attempt ${attempt + 1}/${maxRetries} failed`, {
          error: error.message,
          model,
          attemptDuration,
          willRetry: attempt < maxRetries - 1,
          totalAttempts: this.totalAttempts
        });

        if (attempt < maxRetries - 1) {
          const backoffMs = 1000 * (attempt + 1);
          logger.info(`[${provider}] Retrying after ${backoffMs}ms`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.error(`[${provider}] All attempts failed`, {
      error: lastError?.message,
      totalAttempts: this.totalAttempts,
      durationMs: totalDuration
    });
    
    throw lastError || new Error(`Failed to generate TTS with provider: ${provider}`);
  }
}

module.exports = new TTSService();
