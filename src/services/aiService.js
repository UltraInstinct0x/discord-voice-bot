const { OpenAI } = require("openai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const { CONFIG } = require("../config/config");
const logger = require("../utils/logger");

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

class AIService {
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
      const audioStream = fs.createReadStream(wavFile);
      const response = await openai.audio.transcriptions.create({
        file: audioStream,
        model: "whisper-1",
        language: "en",
      });
      return response.text;
    } catch (error) {
      logger.error("Error transcribing audio", { error: error.message });
      throw error;
    }
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
