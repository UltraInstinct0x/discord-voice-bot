const CONFIG = {
  MODELS: {
    GPT35: {
      name: "gpt-3.5-turbo",
      provider: "openai",
      maxTokens: 4096,
    },
    GPT4: {
      name: "gpt-4-turbo-preview",
      provider: "openai",
      maxTokens: 128000,
    },
    CLAUDE: {
      name: "claude-3-sonnet-20240229",
      provider: "anthropic",
      maxTokens: 200000,
    },
    MIXTRAL: {
      name: "mixtral-8x7b-32768",
      provider: "groq",
      maxTokens: 32768,
    },
  },
  TIERS: {
    FREE: {
      maxTokens: 100,
      ttsProvider: "huggingface",
      streaming: false,
      allowedModels: ["GPT35"],
    },
    PREMIUM: {
      maxTokens: 250,
      ttsProvider: "elevenlabs",
      streaming: true,
      allowedModels: ["GPT35", "GPT4", "CLAUDE", "MIXTRAL"],
    },
  },
  TTS_PROVIDERS: {
    ELEVENLABS: "elevenlabs",
    HUGGINGFACE: "huggingface",
  },
  AUDIO_SETTINGS: {
    silenceThreshold: 500,
    minAudioSize: 4800,
    sampleRate: 48000,
    channels: 1,
    frameSize: 960,
  },
  RESPONSE_CONFIG: {
    LONG_RESPONSE_THRESHOLD: 200,  // characters
    SILENCE_DURATION: 2000,        // ms
    THINKING_RESPONSES: [
      "Let me think about that for a moment...",
      "Processing your request...",
      "Analyzing your message...",
      "Working on it...",
      "Give me a second...",
    ],
  }
};

module.exports = CONFIG;
