const { OpenAI } = require("openai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const CONFIG = require("../config/config");
const logger = require("../utils/logger");

class AIService {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async handleResponse(prompt, settings) {
    logger.info('Generating AI response', { prompt: prompt.substring(0, 100), model: settings.model });
    
    try {
      let response;
      const modelConfig = CONFIG.MODELS[settings.model];

      switch (modelConfig.provider) {
        case 'openai':
          response = await this.openai.chat.completions.create({
            model: modelConfig.name,
            messages: [{ role: "user", content: prompt }],
            max_tokens: settings.maxTokens || modelConfig.maxTokens,
            temperature: 0.7,
          });
          return response.choices[0].message.content;

        case 'groq':
          response = await this.groq.chat.completions.create({
            model: modelConfig.name,
            messages: [{ role: "user", content: prompt }],
            max_tokens: settings.maxTokens || modelConfig.maxTokens,
            temperature: 0.7,
          });
          return response.choices[0].message.content;

        case 'anthropic':
          response = await this.anthropic.messages.create({
            model: modelConfig.name,
            max_tokens: settings.maxTokens || modelConfig.maxTokens,
            messages: [{ role: "user", content: prompt }],
          });
          return response.content[0].text;

        default:
          throw new Error(`Unsupported AI provider: ${modelConfig.provider}`);
      }
    } catch (error) {
      logger.error('Error generating AI response', { 
        error: error.message, 
        prompt: prompt.substring(0, 100), 
        model: settings.model 
      });
      throw error;
    }
  }

  async transcribeAudio(wavFile) {
    logger.info('Starting audio transcription');
    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(wavFile),
        model: "whisper-1",
      });
      logger.info('Audio transcription completed', { 
        text: transcription.text.substring(0, 100) 
      });
      return transcription.text;
    } catch (error) {
      logger.error('Error transcribing audio', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AIService();
