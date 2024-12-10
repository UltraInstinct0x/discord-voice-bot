require("dotenv").config();
const { OpenAI } = require("openai");
const Groq = require("groq-sdk");
const Anthropic = require("@anthropic-ai/sdk");
const ElevenLabs = require("elevenlabs-node");
const {
  joinVoiceChannel,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  EndBehaviorType,
  getVoiceConnection,
  entersState,
} = require("@discordjs/voice");
const {
  GatewayIntentBits,
  Client,
  Events,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");
const prism = require("prism-media");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const os = require("os");

// Basic route to keep the service alive
app.get("/", (req, res) => {
  res.send("Discord bot is running!");
});

// Start the server
app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// Configuration
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
  LONG_RESPONSE_THRESHOLD: 200,  // characters
  SILENCE_DURATION: 2000,        // ms
  THINKING_RESPONSES: [
    "Let me think about that for a moment...",
    "Processing your request...",
    "Analyzing that complex question...",
    "Give me a moment to consider that...",
  ]
};

// Initialize AI clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const voice = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize user settings
const userSettings = new Map();

function getUserSettings(userId) {
  const defaultSettings = {
    tier: "FREE",
    ttsProvider: CONFIG.TIERS.FREE.ttsProvider,
    streaming: CONFIG.TIERS.FREE.streaming,
    model: CONFIG.TIERS.FREE.allowedModels[0],
    maxTokens: CONFIG.TIERS.FREE.maxTokens
  };

  if (!userSettings.has(userId)) {
    userSettings.set(userId, defaultSettings);
  }
  return userSettings.get(userId);
}

// Slash commands
const commands = [
  new SlashCommandBuilder()
    .setName("agentic")
    .setDescription("Toggle agentic mode (join/leave voice channel)"),
  new SlashCommandBuilder()
    .setName("model")
    .setDescription("Set the AI model to use")
    .addStringOption((option) =>
      option
        .setName("model")
        .setDescription("Choose the AI model")
        .setRequired(true)
        .addChoices(
          { name: "GPT-3.5", value: "GPT35" },
          { name: "GPT-4", value: "GPT4" },
          { name: "Claude Sonnet", value: "CLAUDE" },
          { name: "Mixtral-8x7B", value: "MIXTRAL" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("test")
    .setDescription("Test the bot's functionality")
    .addStringOption((option) =>
      option
        .setName("feature")
        .setDescription("Feature to test")
        .setRequired(true)
        .addChoices(
          { name: "Voice Recognition", value: "voice" },
          { name: "Text Generation", value: "text" },
          { name: "TTS", value: "tts" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("settier")
    .setDescription("Set your tier")
    .addStringOption((option) =>
      option
        .setName("tier")
        .setDescription("Choose your tier")
        .setRequired(true)
        .addChoices(
          { name: "Free", value: "FREE" },
          { name: "Premium", value: "PREMIUM" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("setprovider")
    .setDescription("Set TTS provider")
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription("Choose TTS provider")
        .setRequired(true)
        .addChoices(
          { name: "ElevenLabs", value: "elevenlabs" },
          { name: "Facebook MMS", value: "huggingface_facebook" },
          { name: "Facebook FastSpeech2", value: "huggingface_fastspeech" },
          { name: "Coqui XTTS-v2", value: "huggingface_coqui" },
          { name: "Indic TTS", value: "huggingface_indic" },
        ),
    ),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("View your current settings"),
];

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log("Slash commands registered");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

// Command handlers
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  switch (commandName) {
    case "agentic":
      // Join voice channel logic
      break;

    case "model":
      const model = interaction.options.getString("model");
      userSettings.set(interaction.user.id, {
        ...getUserSettings(interaction.user.id),
        model: model,
      });
      await interaction.reply(`Model set to ${model}`);
      break;

    case "test":
      const feature = interaction.options.getString("feature");
      // Test feature logic
      break;

    case "settier":
      const tier = interaction.options.getString("tier");
      const tierConfig = CONFIG.TIERS[tier];
      if (!tierConfig) {
        await interaction.reply(`Invalid tier: ${tier}`);
        return;
      }
      userSettings.set(interaction.user.id, {
        ...getUserSettings(interaction.user.id),
        tier,
        ttsProvider: tierConfig.ttsProvider,
        streaming: tierConfig.streaming,
        maxTokens: tierConfig.maxTokens,
        model: tierConfig.allowedModels[0]
      });
      await interaction.reply(`Tier set to ${tier}. Updated settings:\nTTS Provider: ${tierConfig.ttsProvider}\nStreaming: ${tierConfig.streaming}\nMax Tokens: ${tierConfig.maxTokens}\nModel: ${tierConfig.allowedModels[0]}`);
      break;

    case "setprovider":
      const provider = interaction.options.getString("provider");
      userSettings.set(interaction.user.id, {
        ...getUserSettings(interaction.user.id),
        ttsProvider: provider,
      });
      await interaction.reply(`TTS provider set to ${provider}`);
      break;

    case "settings":
      try {
        const settings = await getUserSettings(interaction.user.id);
        const modelConfig = CONFIG.MODELS[settings.model || "GPT35"];

        // Ensure all field values are strings and have fallbacks
        const settingsEmbed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle('🛠️ Current Settings')
          .addFields([
            { name: '🤖 AI Provider', value: String(settings.provider || 'Not set'), inline: true },
            { name: '📝 Model', value: String(settings.model || 'Not set'), inline: true },
            { name: '🎯 Max Tokens', value: String(settings.maxTokens || 'Default'), inline: true },
            { name: '🔄 Streaming', value: settings.streaming ? 'Enabled' : 'Disabled', inline: true },
            { name: '🗣️ TTS Provider', value: String(settings.ttsProvider || 'Default'), inline: true }
          ]);

        await interaction.reply({ embeds: [settingsEmbed] });
      } catch (error) {
        console.error('Settings command error:', error);
        await interaction.reply({ 
          content: '❌ There was an error displaying your settings. Please try again later.',
          ephemeral: true 
        });
      }
      return;
  }
});

client.on(Events.ClientReady, () => {
  console.log("Ready!");
  registerCommands();
});

client.on(Events.MessageCreate, async (message) => {
  // Handle !machine command
  if (message.content.toLowerCase() === "!machine") {
    try {
      const channel = message.member?.voice.channel;
      if (!channel) {
        await message.reply("You need to be in a voice channel first!");
        return;
      }

      const existingConnection = getVoiceConnection(message.guild.id);
      if (existingConnection) {
        // If bot is already in the channel, leave it
        existingConnection.destroy();
        cleanup();
        await message.reply("Left the voice channel!");
        return;
      }

      // Join the channel
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });

      const settings = getUserSettings(message.author.id);
      await message.reply(`Joined ${channel.name}!\n\nCurrent settings:\nTier: ${settings.tier}\nTTS Provider: ${settings.ttsProvider}\nStreaming: ${settings.streaming}\nModel: ${settings.model}`);

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log("Voice connection ready!");
        // Start listening for voice commands
        listenAndRespond(connection, connection.receiver, message);
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          connection.destroy();
          cleanup();
        }
      });

      return;
    } catch (error) {
      console.error("Error in !machine command:", error);
      await message.reply("Failed to join the voice channel.");
      return;
    }
  }

  // Handle messages in voice channel text chat or mentions
  const botVoiceConnection = getVoiceConnection(message.guild.id);
  const isInVoiceChannel = botVoiceConnection && 
                          message.member?.voice.channel?.id === botVoiceConnection.joinConfig.channelId;

  if (isInVoiceChannel || message.mentions.has(client.user)) {
    // Ignore messages from bots
    if (message.author.bot) return;

    try {
      const settings = getUserSettings(message.author.id);
      let prompt = message.mentions.has(client.user) 
        ? message.content.replace(`<@${client.user.id}>`, '').trim()
        : message.content.trim();
      
      // Handle attachments
      if (message.attachments.size > 0) {
        const attachmentDescriptions = await Promise.all(
          message.attachments.map(async (attachment) => {
            if (attachment.contentType?.startsWith('image/')) {
              return `[Image attached: ${attachment.name}]`;
            } else if (attachment.contentType?.startsWith('text/')) {
              const response = await fetch(attachment.url);
              const text = await response.text();
              return `[Text content from ${attachment.name}]: ${text}`;
            }
            return `[File attached: ${attachment.name}]`;
          })
        );
        prompt = `${prompt}\n\nAttachments:\n${attachmentDescriptions.join('\n')}`;
      }

      // Generate initial voice response if in voice channel
      if (isInVoiceChannel && botVoiceConnection) {
        const initialResponse = generateInitialResponse(prompt);
        const audioPath = await generateTTS(initialResponse, settings.ttsProvider);
        await playResponse(audioPath, botVoiceConnection);
      }

      // Generate and send the main response
      const response = await handleAIResponse(prompt, settings);
      await message.reply(response);

      // Send voice response if in voice channel
      if (isInVoiceChannel && botVoiceConnection) {
        const audioPath = await generateTTS(response, settings.ttsProvider);
        await playResponse(audioPath, botVoiceConnection);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await message.reply('Sorry, I encountered an error while processing your request.');
    }
  }
});

let currentConnection = null;
let currentAudioStream = null;
let currentOpusDecoder = null;
let currentSilenceInterval = null;

async function listenAndRespond(connection, receiver, message) {
  // Cleanup previous connection if exists
  if (currentConnection) {
    cleanup();
  }

  currentConnection = connection;
  let isProcessing = false;
  let audioBuffer = Buffer.alloc(0);
  let silenceStart = null;
  let lastChunkTime = Date.now();

  currentAudioStream = receiver.subscribe(message.author.id, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });

  currentOpusDecoder = new prism.opus.Decoder({
    rate: CONFIG.AUDIO_SETTINGS.sampleRate,
    channels: CONFIG.AUDIO_SETTINGS.channels,
    frameSize: CONFIG.AUDIO_SETTINGS.frameSize,
  });

  currentSilenceInterval = setInterval(() => {
    const now = Date.now();
    if (
      now - lastChunkTime > CONFIG.AUDIO_SETTINGS.silenceThreshold &&
      !silenceStart
    ) {
      silenceStart = now;
    }

    if (
      silenceStart &&
      now - silenceStart > CONFIG.AUDIO_SETTINGS.silenceThreshold &&
      audioBuffer.length > 0 &&
      !isProcessing
    ) {
      isProcessing = true;
      const currentBuffer = audioBuffer;
      audioBuffer = Buffer.alloc(0);

      processAudioBuffer(currentBuffer, connection, message)
        .catch(console.error)
        .finally(() => {
          isProcessing = false;
        });
    }
  }, 100);

  currentAudioStream.pipe(currentOpusDecoder).on("data", async (chunk) => {
    lastChunkTime = Date.now();
    if (silenceStart) silenceStart = null;

    audioBuffer = Buffer.concat([audioBuffer, chunk]);

    if (
      audioBuffer.length > CONFIG.AUDIO_SETTINGS.sampleRate * 2 &&
      !isProcessing
    ) {
      isProcessing = true;
      const currentBuffer = audioBuffer;
      audioBuffer = Buffer.alloc(0);

      try {
        await processAudioBuffer(currentBuffer, connection, message);
      } catch (error) {
        console.error("Error processing audio:", error);
      } finally {
        isProcessing = false;
      }
    }
  });

  currentAudioStream.on("end", () => {
    cleanup();
    // Restart listening
    setTimeout(() => {
      listenAndRespond(connection, receiver, message);
    }, 100);
  });

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    cleanup();
  });
}

function cleanup() {
  if (currentSilenceInterval) {
    clearInterval(currentSilenceInterval);
    currentSilenceInterval = null;
  }
  if (currentOpusDecoder) {
    currentOpusDecoder.destroy();
    currentOpusDecoder = null;
  }
  if (currentAudioStream) {
    currentAudioStream.destroy();
    currentAudioStream = null;
  }
}

async function processAudioBuffer(buffer, connection, message) {
  try {
    const wavFile = path.join(os.tmpdir(), `${Date.now()}.wav`);
    await createWavFile(buffer, wavFile);
    
    const transcription = await transcribeAudio(wavFile);
    if (!transcription) return;

    // Format the transcribed request
    const formattedRequest = `> 🗣️ ${message.author} asked:\n> "${transcription}"`;
    await message.channel.send(formattedRequest);

    const settings = await getUserSettings(message.author.id);
    
    // For longer requests, provide a thinking response
    if (transcription.length > 50) {
      const thinkingResponse = RESPONSE_CONFIG.THINKING_RESPONSES[Math.floor(Math.random() * RESPONSE_CONFIG.THINKING_RESPONSES.length)];
      const audioPath = await generateTTS(thinkingResponse, settings.ttsProvider);
      await playResponse(audioPath, connection);
    }

    const aiResponse = await handleAIResponse(transcription, settings);
    
    // Handle long responses differently
    if (aiResponse.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD && connection) {
      const summary = await handleAIResponse(`Summarize this in 2-3 sentences while keeping the main points: ${aiResponse}`, settings);
      const ttsResponse = `Here's a summary: ${summary}\nCheck the chat for the complete response.`;
      
      // Send full response in text channel
      await message.channel.send(`🤖 Response:\n${aiResponse}`);
      
      // Generate and play TTS for summary
      const audioPath = await generateTTS(ttsResponse, settings.ttsProvider);
      await playResponse(audioPath, connection);
    } else {
      // For shorter responses, handle normally
      await message.channel.send(`🤖 Response:\n${aiResponse}`);
      const audioPath = await generateTTS(aiResponse, settings.ttsProvider);
      await playResponse(audioPath, connection);
    }

    fs.unlink(wavFile, (err) => {
      if (err) console.error('Error deleting wav file:', err);
    });
  } catch (error) {
    handleError(error, 'processAudioBuffer');
  }
}

async function handleAIResponse(prompt, settings) {
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
        if (settings.streaming) {
          const stream = await groq.chat.completions.create({
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
          response = await groq.chat.completions.create({
            model: modelConfig.name,
            messages: [{ role: "user", content: prompt }],
            max_tokens: Math.min(settings.maxTokens, modelConfig.maxTokens),
            stream: false,
          });
          return response.choices[0].message.content;
        }

      default:
        throw new Error("Unsupported AI provider");
    }
  } catch (error) {
    console.error("AI response error:", error);
    throw error;
  }
}

async function transcribeAudio(wavFile) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavFile),
      model: "whisper-1",
      language: "en",
    });
    return transcription.text;
  } catch (error) {
    console.error("Transcription error:", error);
    return null;
  }
}

async function generateTTS(text, provider) {
  console.log(`Starting TTS generation with provider: ${provider}`);
  
  // Get fallback order starting from the requested provider
  const fallbackOrder = [...CONFIG.TTS_FALLBACK_ORDER];
  if (provider !== fallbackOrder[0]) {
    const index = fallbackOrder.indexOf(provider);
    if (index !== -1) {
      fallbackOrder.splice(index, 1);
      fallbackOrder.unshift(provider);
    }
  }

  console.log(`Fallback order: ${fallbackOrder.join(' -> ')}`);
  let lastError = null;

  for (const currentProvider of fallbackOrder) {
    try {
      console.log(`Attempting TTS with provider: ${currentProvider}`);
      
      if (currentProvider === CONFIG.TTS_PROVIDERS.ELEVENLABS) {
        const result = await elevenLabsTTS(text);
        if (result) {
          console.log(`Successfully generated TTS with ElevenLabs`);
          return result;
        }
      } else {
        const model = CONFIG.TTS_MODELS[currentProvider];
        if (!model) {
          console.warn(`No model configured for provider: ${currentProvider}, skipping`);
          continue;
        }

        const result = await huggingFaceTTS(text, model);
        if (result) {
          console.log(`Successfully generated TTS with ${currentProvider} (${model})`);
          return result;
        }
      }
      
      console.warn(`Provider ${currentProvider} failed to generate TTS, trying next`);
    } catch (error) {
      lastError = error;
      console.error(`Error with provider ${currentProvider}:`, error.message);
      const nextProvider = fallbackOrder[fallbackOrder.indexOf(currentProvider) + 1];
      if (nextProvider) {
        console.log(`Falling back to ${nextProvider}`);
      }
    }
  }

  console.error(`All TTS providers failed. Last error:`, lastError?.message);
  throw new Error(`Failed to generate TTS with any provider. Last error: ${lastError?.message}`);
}

async function elevenLabsTTS(text) {
  const startTime = Date.now();
  console.log('[ElevenLabs] Starting TTS generation');
  
  const fileName = `${Date.now()}.mp3`;
  try {
    const response = await voice.textToSpeech({ fileName, textInput: text });
    const duration = Date.now() - startTime;
    
    if (response.status === "ok") {
      console.log(`[ElevenLabs] Successfully generated TTS in ${duration}ms`);
      return fileName;
    } else {
      console.error('[ElevenLabs] Failed to generate TTS:', response);
      return null;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ElevenLabs] Error after ${duration}ms:`, error);
    return null;
  }
}

async function huggingFaceTTS(text, model, maxRetries = 2) {
  const startTime = Date.now();
  console.log(`[HuggingFace] Starting TTS generation with model: ${model}`);
  
  const audioPath = path.join(__dirname, 'temp', `${Date.now()}.wav`);
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const attemptStartTime = Date.now();
    try {
      console.log(`[HuggingFace] Attempt ${attempt + 1}/${maxRetries}`);
      
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
        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
      }

      const buffer = await response.buffer();
      fs.writeFileSync(audioPath, buffer);
      
      const duration = Date.now() - startTime;
      console.log(`[HuggingFace] Successfully generated TTS in ${duration}ms`);
      return audioPath;
    } catch (error) {
      lastError = error;
      const attemptDuration = Date.now() - attemptStartTime;
      console.warn(`[HuggingFace] Attempt ${attempt + 1} failed after ${attemptDuration}ms:`, error.message);

      if (attempt < maxRetries - 1) {
        const backoffMs = 1000 * (attempt + 1);
        console.log(`[HuggingFace] Retrying after ${backoffMs}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  console.error(`[HuggingFace] All attempts failed after ${totalDuration}ms`);
  return null;
}

async function playResponse(audioPath, connection) {
  try {
    const player = createAudioPlayer();
    const resource = createAudioResource(audioPath, {
      inputType: StreamType.Arbitrary,
    });

    player.play(resource);
    connection.subscribe(player);

    await new Promise((resolve) => {
      player.on(AudioPlayerStatus.Idle, () => {
        player.stop();
        try {
          fs.unlinkSync(audioPath);
        } catch (err) {
          console.error("Cleanup error:", err);
        }
        resolve();
      });
    });
  } catch (error) {
    console.error("Playback error:", error);
  }
}

async function createWavFile(buffer, filepath) {
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(CONFIG.AUDIO_SETTINGS.sampleRate, 24);
  header.writeUInt32LE(CONFIG.AUDIO_SETTINGS.sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(buffer.length, 40);

  await fs.promises.writeFile(filepath, Buffer.concat([header, buffer]));
}

function isCompleteSentence(text) {
  const endings = [".", "!", "?", "..."];
  return endings.some((ending) => text.trim().endsWith(ending));
}

// Error handling utility
function handleError(error, context) {
  console.error(`Error in ${context}:`, error);
  // You could add error reporting service here
}

client.on("error", (error) => {
  console.error("Discord client error:", error);
  cleanup();
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  cleanup();
});

process.on("SIGINT", () => {
  console.log("Received SIGINT. Cleaning up...");
  cleanup();
  process.exit(0);
});

function generateInitialResponse(prompt) {
  // Extract key topics from the prompt
  const topics = prompt.toLowerCase();
  
  if (topics.includes('image') || topics.includes('picture')) {
    return "I see you've shared an image. Let me take a look at it.";
  } else if (topics.includes('analyze') || topics.includes('review')) {
    return "I'll analyze that for you. Give me a moment to think about it.";
  } else if (topics.includes('help') || topics.includes('how')) {
    return "I'll help you with that. Let me prepare a detailed response.";
  } else if (topics.includes('explain') || topics.includes('what')) {
    return "I'll explain that for you. Let me gather my thoughts.";
  }
  
  return "I'm processing your request. I'll have a detailed response for you shortly.";
}

// Start the bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});
