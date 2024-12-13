const { OpenAI } = require("openai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const { CONFIG, RESPONSE_CONFIG } = require("../config/config");
const logger = require("../utils/logger");
const AudioPreprocessor = require("./audioPreprocessor");
const VoiceActivityDetector = require("./voiceActivityDetector");

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

class AIService {
  constructor() {
    this.audioPreprocessor = new AudioPreprocessor();
    this.vad = new VoiceActivityDetector();
  }

  async handleResponse(prompt, settings) {
    const modelConfig = CONFIG.MODELS[settings.model || "GPT35"];

    try {
      let response;
      switch (modelConfig.provider) {
        case "openai":
          if (settings.streaming) {
            const stream = await openai.chat.completions.create({
              model: modelConfig.name,
              messages: [{ role: "user", content: prompt }],
              max_tokens: Math.min(settings.maxTokens, modelConfig.maxTokens),
              stream: true,
            });
            let fullResponse = '';
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || '';
              fullResponse += content;
            }
            return fullResponse;
          } else {
            response = await openai.chat.completions.create({
              model: modelConfig.name,
              messages: [{ role: "user", content: prompt }],
              max_tokens: Math.min(settings.maxTokens, modelConfig.maxTokens),
              stream: false,
            });
            return response.choices[0].message.content;
          }

        case "anthropic":
          if (settings.streaming) {
            const stream = await anthropic.messages.stream({
              model: modelConfig.name,
              messages: [{ role: "user", content: prompt }],
              max_tokens: Math.min(settings.maxTokens || 1024, modelConfig.maxTokens || 4096),
            });
            let fullResponse = '';
            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta') {
                fullResponse += chunk.delta.text;
              }
            }
            return fullResponse;
          } else {
            response = await anthropic.messages.create({
              model: modelConfig.name,
              messages: [{ role: "user", content: prompt }],
              max_tokens: Math.min(settings.maxTokens || 1024, modelConfig.maxTokens || 4096),
            });
            return response.content[0].text;
          }

        case "groq":
          response = await groq.chat.completions.create({
            model: modelConfig.name,
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.min(settings.maxTokens || 1024, modelConfig.maxTokens || 4096),
          });
          return response.choices[0].message.content;

        default:
          throw new Error(`Unsupported AI provider: ${modelConfig.provider}`);
      }
    } catch (error) {
      logger.error("Error in AI response", { error: error.message });
      throw error;
    }
  }

  async transcribeAudio(wavFile) {
    try {
      // Read the file into a buffer
      const audioBuffer = await fs.promises.readFile(wavFile);

      // Check for voice activity
      if (!this.vad.processAudio(audioBuffer)) {
        logger.debug("No voice activity detected");
        return RESPONSE_CONFIG.ERROR_MESSAGES.AUDIO_TOO_QUIET;
      }

      // Preprocess the audio
      const processedBuffer = await this.preprocessAudio(audioBuffer);
      
      // Check minimum audio size
      if (processedBuffer.length < CONFIG.AUDIO_SETTINGS.minAudioSize) {
        logger.debug("Audio too short after preprocessing");
        return RESPONSE_CONFIG.ERROR_MESSAGES.AUDIO_TOO_SHORT;
      }

      // Create a new temporary file with processed audio
      const processedWavFile = wavFile.replace('.wav', '_processed.wav');
      await this.saveProcessedAudio(processedBuffer, processedWavFile);

      // Transcribe with Whisper
      const audioStream = fs.createReadStream(processedWavFile);
      const response = await openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        ...CONFIG.AUDIO_SETTINGS.whisperConfig
      });

      // Clean up processed file
      await fs.promises.unlink(processedWavFile);

      if (!response.text || response.text.trim().length === 0) {
        return RESPONSE_CONFIG.ERROR_MESSAGES.TRANSCRIPTION_FAILED;
      }

      return response.text;
    } catch (error) {
      logger.error("Error transcribing audio", { error: error.message });
      throw error;
    }
  }

  async preprocessAudio(audioBuffer) {
    return new Promise((resolve, reject) => {
      try {
        const chunks = [];
        this.audioPreprocessor.on('data', chunk => chunks.push(chunk));
        this.audioPreprocessor.on('end', () => resolve(Buffer.concat(chunks)));
        this.audioPreprocessor.on('error', reject);

        this.audioPreprocessor.write(audioBuffer);
        this.audioPreprocessor.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async saveProcessedAudio(buffer, filepath) {
    return new Promise((resolve, reject) => {
      const wav = require('wav');
      const writer = new wav.FileWriter(filepath, {
        channels: CONFIG.AUDIO_SETTINGS.channels,
        sampleRate: CONFIG.AUDIO_SETTINGS.sampleRate,
        bitDepth: 16
      });

      writer.on('error', reject);
      writer.on('finish', resolve);

      writer.write(buffer);
      writer.end();
    });
  }

  async generateInitialResponse(prompt) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
      });
      return response.choices[0].message.content;
    } catch (error) {
      logger.error("Error generating initial response", { error: error.message });
      return "I'm processing your request...";
    }
  }
}

module.exports = new AIService();