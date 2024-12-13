const path = require('path');
const os = require('os');
const fs = require('fs');
const fsPromises = require('fs').promises;
const logger = require('../utils/logger');
const { CONFIG } = require('../config/config');
const { pipeline } = require('stream/promises');
const fetch = require('node-fetch');
const axios = require('axios');

class TTSService {
    constructor() {
        this.elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
        this.elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Default Adam voice
        this.huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;
        this.tiktokSessionId = process.env.TIKTOK_SESSION_ID;
        this.tiktokBaseUrl = 'https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke';
        this.tiktokVoice = 'en_us_001';

        // Log environment variable status (safely)
        logger.info('TTS Service initialized', {
            hasElevenLabsKey: !!this.elevenLabsApiKey,
            hasHuggingFaceKey: !!this.huggingFaceApiKey,
            hasTiktokSession: !!this.tiktokSessionId,
            envKeys: Object.keys(process.env).filter(key => key.includes('API_KEY') || key.includes('SESSION_ID')),
        });

        if (!this.huggingFaceApiKey) {
            logger.error('HuggingFace API key not found in environment variables');
        }
    }

    async generateTTS(text, provider = 'tiktok', options = {}) {
        const { isVoiceInput = false, isPremium = false } = options;
        
        logger.info('TTS generation started', {
            provider,
            textLength: text.length,
            isVoiceInput,
            isPremium
        });

        try {
            // For free tier, try TikTok first
            if (!isPremium && this.tiktokSessionId) {
                try {
                    const audioPath = await this.generateTikTokTTS(text, isVoiceInput);
                    if (audioPath) {
                        return audioPath;
                    }
                } catch (error) {
                    logger.warn('TikTok TTS failed, trying HuggingFace', {
                        error: error.message,
                        isVoiceInput
                    });
                }
            }

            // For premium tier or if TikTok fails, try HuggingFace
            if (isPremium || !this.tiktokSessionId) {
                try {
                    const audioPath = await this.generateHuggingFaceTTS(text, isVoiceInput);
                    if (audioPath) {
                        return audioPath;
                    }
                } catch (error) {
                    logger.warn('HuggingFace TTS failed, trying FastSpeech2', {
                        error: error.message,
                        isVoiceInput
                    });
                }

                try {
                    const audioPath = await this.generateFastSpeech2TTS(text, isVoiceInput);
                    if (audioPath) {
                        return audioPath;
                    }
                } catch (error) {
                    logger.warn('FastSpeech2 TTS failed, falling back to ElevenLabs', {
                        error: error.message,
                        isVoiceInput
                    });
                }
            }

            // Use ElevenLabs as last resort for premium users
            if (isPremium && this.elevenLabsApiKey) {
                return await this.generateElevenLabsTTS(text, isVoiceInput);
            }

            // If we're here and TikTok failed for free tier, try one last time
            if (!isPremium && this.tiktokSessionId) {
                try {
                    const audioPath = await this.generateTikTokTTS(text, isVoiceInput);
                    if (audioPath) {
                        return audioPath;
                    }
                } catch (error) {
                    logger.error('All TTS providers failed', {
                        error: error.message,
                        isVoiceInput
                    });
                }
            }

            throw new Error('All TTS providers failed');
        } catch (error) {
            logger.error('TTS generation failed', {
                error: error.message,
                provider,
                textLength: text.length,
                isPremium
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
            const stats = await fsPromises.stat(outputPath);

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

        // Validate token before making request
        if (!this.huggingFaceApiKey) {
            throw new Error('HuggingFace API key not configured');
        }

        const requestBody = {
            inputs: text,
            wait_for_model: true
        };

        logger.info('HuggingFace TTS started', {
            model: 'facebook/mms-tts-eng',
            textLength: text.length,
            maxRetries,
            isVoiceInput,
            requestBody,
            tokenLength: this.huggingFaceApiKey ? this.huggingFaceApiKey.length : 0
        });

        while (retries <= maxRetries) {
            try {
                const outputPath = path.join(os.tmpdir(), `${Date.now()}_huggingface.wav`);
                
                const headers = {
                    'Authorization': `Bearer ${this.huggingFaceApiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/wav'
                };

                logger.debug('HuggingFace request details', {
                    url: 'https://api-inference.huggingface.co/models/facebook/mms-tts-eng',
                    method: 'POST',
                    headerKeys: Object.keys(headers),
                    tokenPrefix: this.huggingFaceApiKey ? this.huggingFaceApiKey.substring(0, 4) + '...' : 'none'
                });

                const response = await fetch(
                    'https://api-inference.huggingface.co/models/facebook/mms-tts-eng',
                    {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(requestBody),
                    }
                );

                if (!response.ok) {
                    const responseText = await response.text();
                    logger.error('HuggingFace API error details', {
                        status: response.status,
                        statusText: response.statusText,
                        responseBody: responseText,
                        headers: Object.fromEntries([...response.headers])
                    });

                    if (response.status === 503) {
                        logger.warn('HuggingFace model loading, retrying...', {
                            retry: retries + 1,
                            maxRetries
                        });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        retries++;
                        continue;
                    }
                    throw new Error(`HuggingFace API error: ${response.statusText} - ${responseText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                await fs.promises.writeFile(outputPath, Buffer.from(arrayBuffer));
                
                const duration = Date.now() - startTime;
                const stats = await fs.promises.stat(outputPath);

                logger.info('HuggingFace TTS completed', {
                    model: 'facebook/mms-tts-eng',
                    duration,
                    retries,
                    fileSize: stats.size,
                    outputPath,
                    isVoiceInput,
                    responseHeaders: Object.fromEntries([...response.headers])
                });

                return outputPath;
            } catch (error) {
                retries++;
                const duration = Date.now() - startTime;
                logger.error('HuggingFace TTS error', {
                    error: error.message,
                    stack: error.stack,
                    duration,
                    retry: retries,
                    maxRetries
                });

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

    async generateFastSpeech2TTS(text, isVoiceInput) {
        const startTime = Date.now();
        const maxRetries = 2;
        let retries = 0;

        logger.info('FastSpeech2 TTS started', {
            model: 'facebook/fastspeech2-en-ljspeech',
            textLength: text.length,
            maxRetries,
            isVoiceInput
        });

        while (retries <= maxRetries) {
            try {
                const outputPath = path.join(os.tmpdir(), `${Date.now()}_fastspeech2.wav`);
                
                const response = await fetch(
                    'https://api-inference.huggingface.co/models/facebook/fastspeech2-en-ljspeech',
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.huggingFaceApiKey}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            inputs: text,
                        }),
                    }
                );

                if (!response.ok) {
                    if (response.status === 503) {
                        logger.warn('FastSpeech2 model loading, retrying...', {
                            retry: retries + 1,
                            maxRetries
                        });
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        retries++;
                        continue;
                    }
                    throw new Error(`FastSpeech2 API error: ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                await fs.promises.writeFile(outputPath, Buffer.from(arrayBuffer));
                
                const duration = Date.now() - startTime;
                const stats = await fs.promises.stat(outputPath);

                logger.info('FastSpeech2 TTS completed', {
                    model: 'facebook/fastspeech2-en-ljspeech',
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
                logger.warn('FastSpeech2 TTS retry', {
                    error: error.message,
                    retry: retries,
                    maxRetries
                });
                await new Promise(resolve => setTimeout(resolve, 2000 * retries));
            }
        }
    }

    async generateTikTokTTS(text, isVoiceInput) {
        const startTime = Date.now();
        
        logger.info('TikTok TTS started', {
            textLength: text.length,
            isVoiceInput
        });

        try {
            const preparedText = text.replace('+', 'plus').replace(/\s/g, '+').replace('&', 'and');
            const outputPath = path.join(os.tmpdir(), `${Date.now()}_tiktok.mp3`);
            
            const url = `${this.tiktokBaseUrl}/?text_speaker=${this.tiktokVoice}&req_text=${preparedText}&speaker_map_type=0&aid=1233`;
            const headers = {
                'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)',
                'Cookie': `sessionid=${this.tiktokSessionId}`,
                'Accept-Encoding': 'gzip,deflate,compress'
            };

            logger.debug('TikTok TTS request', {
                url,
                headerKeys: Object.keys(headers),
                textLength: preparedText.length
            });

            const response = await axios.post(url, null, { headers });
            
            if (response?.data?.status_code !== 0) {
                throw new Error(`TikTok API error: status_code ${response?.data?.status_code}`);
            }

            const encoded_voice = response?.data?.data?.v_str;
            if (!encoded_voice) {
                throw new Error('No voice data received from TikTok API');
            }

            await fs.promises.writeFile(outputPath, Buffer.from(encoded_voice, 'base64'));
            
            const duration = Date.now() - startTime;
            const stats = await fs.promises.stat(outputPath);

            logger.info('TikTok TTS completed', {
                duration,
                fileSize: stats.size,
                outputPath,
                isVoiceInput
            });

            return outputPath;
        } catch (error) {
            const duration = Date.now() - startTime;
            logger.error('TikTok TTS failed', {
                error: error.message,
                stack: error.stack,
                duration,
                isVoiceInput
            });
            throw error;
        }
    }
}

module.exports = new TTSService();