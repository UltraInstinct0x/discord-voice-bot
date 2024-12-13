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
      ttsProvider: "tiktok",
      streaming: false,
      allowedModels: ["GPT35"],
    },
    PREMIUM: {
      maxTokens: 250,
      ttsProvider: "tiktok",
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
    TIKTOK: "tiktok",
  },
  TTS_MODELS: {
    huggingface_facebook: "facebook/mms-tts-eng",
    huggingface_indic: "ai4bharat/indic-tts-coqui-indo_eng-asr_tts",
    huggingface_coqui: "coqui/XTTS-v2",
    huggingface_fastspeech: "facebook/fastspeech2-en-ljspeech",
  },
  TTS_FALLBACK_ORDER: [
    "tiktok",
    "huggingface_facebook",
    "huggingface_fastspeech",
    "huggingface_coqui",
    "huggingface_indic",
    "elevenlabs", 
  ],
  AUDIO_SETTINGS: {
    // Increased silence threshold for better voice detection
    silenceThreshold: 2000,
    // Increased minimum audio size for better quality
    minAudioSize: 9600,
    sampleRate: 48000,
    // Changed to mono for better transcription
    channels: 1,
    frameSize: 960,
    // New settings for improved voice detection
    noiseThreshold: -50,
    // Voice activity detection settings
    vadSettings: {
      enabled: true,
      threshold: 0.5,
      smoothing: 0.1
    },
    // Audio preprocessing settings
    preprocessing: {
      normalize: true,
      removeNoise: true,
      trimSilence: true
    },
    // Whisper specific settings
    whisperConfig: {
      temperature: 0.3,
      language: "en",
      task: "transcribe",
      // Use word timestamps for better accuracy
      word_timestamps: true
    }
  },
  DEFAULT_SETTINGS: {
    ttsProvider: 'tiktok',
    language: 'en',
    voiceCommand: false,
    autoJoin: false
  },
};

const RESPONSE_CONFIG = {
  LONG_RESPONSE_THRESHOLD: 500,
  SILENCE_DURATION: 2000,
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
  ],
  // New error handling messages
  ERROR_MESSAGES: {
    TRANSCRIPTION_FAILED: "I couldn't understand that clearly. Could you please speak more slowly and clearly?",
    AUDIO_TOO_SHORT: "The audio was too short to process. Please speak for a bit longer.",
    AUDIO_TOO_QUIET: "I couldn't hear you clearly. Could you speak a bit louder?",
    BACKGROUND_NOISE: "There seems to be too much background noise. Could you move to a quieter location?",
    NETWORK_ERROR: "I'm having trouble with the connection. Could you try again?"
  }
};

module.exports = {
  CONFIG,
  RESPONSE_CONFIG,
};