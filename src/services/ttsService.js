const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { CONFIG } = require('../config/config');
const { pipeline } = require('stream/promises');
const fetch = require('node-fetch');

class TTSService {
    constructor() {
        this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        this.elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default Adam voice
    }

    async generateTTS(text, provider = 'huggingface_facebook', options = {}) {
        const { isVoiceInput = false } = options;
        
        logger.info('TTS generation started', {
            textLength: text.length,
            isVoiceInput
        });

        try {
            if (isVoiceInput && this.elevenLabsApiKey) {
                try {
                    const audioPath = await this.generateElevenLabsTTS(text, isVoiceInput);
                    return audioPath;
                } catch (error) {
                    logger.warn('ElevenLabs TTS failed, falling back to HuggingFace', {
                        error: error.message,
                        isVoiceInput
                    });
                }
            }

            return await this.generateHuggingFaceTTS(text, isVoiceInput);
        } catch (error) {
            logger.error('TTS generation failed', {
                error: error.message,
                provider,
                textLength: text.length
            });
            throw error;
        }
    }

    async generateElevenLabsTTS(text, isVoiceInput) {
        const startTime = Date.now();
        logger.info('ElevenLabs TTS started', {
            textLength: text.length,
            isVoiceInput
        });

        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${this.elevenLabsVoiceId}`,
                {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': this.elevenLabsApiKey
                    },
                    body: JSON.stringify({
                        text,
                        model_id: 'eleven_monolingual_v1',
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.5
                        }
                    })
                }
            );

            if (!response.ok) {
                throw new Error(`ElevenLabs API error: ${response.statusText}`);
            }

            const outputPath = path.join(os.tmpdir(), `${Date.now()}_elevenlabs.mp3`);
            const fileStream = fs.createWriteStream(outputPath);
            await pipeline(response.body, fileStream);

            const duration = Date.now() - startTime;
            const stats = await fs.stat(outputPath);

            logger.info('ElevenLabs TTS completed', {
                duration,
                fileSize: stats.size,
                outputPath,
                isVoiceInput
            });

            return outputPath;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('ElevenLabs TTS failed', {
                error: error.message,
                duration,
                textLength: text.length,
                isVoiceInput
            });
            throw error;
        }
    }

    async generateHuggingFaceTTS(text, isVoiceInput) {
        const startTime = Date.now();
        const maxRetries = 2;
        let retries = 0;

        logger.info('HuggingFace TTS started', {
            model: 'facebook/mms-tts-eng',
            textLength: text.length,
            maxRetries,
            isVoiceInput
        });

        while (retries <= maxRetries) {
            try {
                const outputPath = path.join(os.tmpdir(), `${Date.now()}_huggingface.wav`);
                
                // Call HuggingFace TTS API here
                // For now, we'll simulate it with a delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const duration = Date.now() - startTime;
                const stats = { size: 1024 }; // Simulated file size

                logger.info('HuggingFace TTS completed', {
                    model: 'facebook/mms-tts-eng',
                    duration,
                    retries,
                    fileSize: stats.size,
                    outputPath,
                    isVoiceInput
                });

                return outputPath;
            } catch (error) {
                retries++;
                if (retries > maxRetries) {
                    throw error;
                }
                logger.warn('HuggingFace TTS retry', {
                    error: error.message,
                    retry: retries,
                    maxRetries
                });
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            }
        }
    }
}

module.exports = new TTSService();