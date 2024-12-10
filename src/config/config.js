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
      ttsProvider: "huggingface_facebook",
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
    HUGGINGFACE_FACEBOOK: "huggingface_facebook",
    HUGGINGFACE_INDIC: "huggingface_indic",
    HUGGINGFACE_COQUI: "huggingface_coqui",
    HUGGINGFACE_FASTSPEECH: "huggingface_fastspeech",
  },
  TTS_MODELS: {
    huggingface_facebook: "facebook/mms-tts-eng",
    huggingface_indic: "ai4bharat/indic-tts-coqui-indo_eng-asr_tts",
    huggingface_coqui: "coqui/XTTS-v2",
    huggingface_fastspeech: "facebook/fastspeech2-en-ljspeech",
  },
  TTS_FALLBACK_ORDER: [
    "elevenlabs",
    "huggingface_facebook",
    "huggingface_fastspeech",
    "huggingface_coqui",
    "huggingface_indic",
  ],
  AUDIO_SETTINGS: {
    silenceThreshold: 500,
    minAudioSize: 4800,
    sampleRate: 48000,
    channels: 1,
    frameSize: 960,
  },
};

const RESPONSE_CONFIG = {
  LONG_RESPONSE_THRESHOLD: 500,  // characters - increased for longer messages
  SILENCE_DURATION: 2000,        // ms
  THINKING_RESPONSES: [
    "Let me think about that for a moment...",
    "Processing your request...",
    "Analyzing that complex question...",
    "Give me a moment to consider that...",
  ],
  RETRY_MESSAGES: [
    "Just a moment, wrapping things up...",
    "Almost there, finalizing the response...",
    "One moment please, putting the finishing touches...",
    "Bear with me, just a bit longer...",
  ]
};

module.exports = {
  CONFIG,
  RESPONSE_CONFIG,
};
