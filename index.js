require("dotenv").config();
const { OpenAI } = require("openai");
const ElevenLabs = require("elevenlabs-node");
const {
  joinVoiceChannel,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  createAudioPlayer,
  EndBehaviorType,
} = require("@discordjs/voice");
const {
  GatewayIntentBits,
  Client,
  Events,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const prism = require("prism-media");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

// Configuration
const CONFIG = {
  TIERS: {
    FREE: {
      maxTokens: 100,
      ttsProvider: "huggingface",
      streaming: false,
    },
    PREMIUM: {
      maxTokens: 250,
      ttsProvider: "elevenlabs",
      streaming: true,
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
};

// Initialize clients
const voice = new ElevenLabs({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
  ],
});

// User settings storage
const userSettings = new Map();

// Slash commands
const commands = [
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
          { name: "HuggingFace", value: "huggingface" },
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
    case "settier":
      const tier = interaction.options.getString("tier");
      userSettings.set(interaction.user.id, {
        ...getUserSettings(interaction.user.id),
        tier: tier,
      });
      await interaction.reply(`Tier set to ${tier}`);
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
      const settings = getUserSettings(interaction.user.id);
      await interaction.reply({
        content: `Current settings:\nTier: ${settings.tier}\nTTS Provider: ${settings.ttsProvider}\nStreaming: ${settings.streaming}`,
        ephemeral: true,
      });
      break;
  }
});

function getUserSettings(userId) {
  if (!userSettings.has(userId)) {
    userSettings.set(userId, {
      tier: "FREE",
      ttsProvider: CONFIG.TIERS.FREE.ttsProvider,
      streaming: CONFIG.TIERS.FREE.streaming,
    });
  }
  return userSettings.get(userId);
}

client.on(Events.ClientReady, () => {
  console.log("Ready!");
  registerCommands();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.content.toLowerCase() === "!machine") {
    const channel = message.member?.voice.channel;
    if (channel) {
      try {
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Ready, () => {
          message.reply(`Joined ${channel.name}!`);
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
          }
        });
      } catch (error) {
        console.error("Failed to join:", error);
        message.reply("Failed to join the voice channel. Please try again.");
      }
    } else {
      message.reply("You need to join a voice channel first!");
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
  if (buffer.length < CONFIG.AUDIO_SETTINGS.minAudioSize) return;

  const settings = getUserSettings(message.author.id);
  const tempDir = path.join(__dirname, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const wavFile = path.join(tempDir, `recording_${Date.now()}.wav`);

  try {
    await createWavFile(buffer, wavFile);
    const transcription = await transcribeAudio(wavFile);

    if (transcription?.trim()) {
      console.log("Transcribed:", transcription);

      if (settings.streaming) {
        await handleStreamingResponse(transcription, connection, settings);
      } else {
        await handleStandardResponse(transcription, connection, settings);
      }
    }
  } catch (error) {
    console.error("Processing error:", error);
  } finally {
    try {
      fs.unlinkSync(wavFile);
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }
}

async function handleStreamingResponse(text, connection, settings) {
  const stream = await openai.chat.completions.create({
    messages: [{ role: "user", content: text }],
    model: "gpt-3.5-turbo",
    max_tokens: CONFIG.TIERS[settings.tier].maxTokens,
    stream: true,
  });

  let responseBuffer = "";
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      responseBuffer += content;
      if (isCompleteSentence(responseBuffer)) {
        const audioPath = await generateTTS(
          responseBuffer,
          settings.ttsProvider,
        );
        if (audioPath) {
          await playResponse(audioPath, connection);
          responseBuffer = "";
        }
      }
    }
  }

  if (responseBuffer) {
    const audioPath = await generateTTS(responseBuffer, settings.ttsProvider);
    if (audioPath) {
      await playResponse(audioPath, connection);
    }
  }
}

async function handleStandardResponse(text, connection, settings) {
  const response = await openai.chat.completions.create({
    messages: [{ role: "user", content: text }],
    model: "gpt-3.5-turbo",
    max_tokens: CONFIG.TIERS[settings.tier].maxTokens,
  });

  const responseText = response.choices[0].message.content.trim();
  if (responseText) {
    console.log("Response:", responseText);
    const audioPath = await generateTTS(responseText, settings.ttsProvider);
    if (audioPath) {
      await playResponse(audioPath, connection);
    }
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
  try {
    switch (provider) {
      case CONFIG.TTS_PROVIDERS.ELEVENLABS:
        return await elevenLabsTTS(text);
      case CONFIG.TTS_PROVIDERS.HUGGINGFACE:
        const result = await huggingFaceTTS(text);
        if (!result) {
          console.log("HuggingFace failed, falling back to ElevenLabs");
          return await elevenLabsTTS(text);
        }
        return result;
      default:
        return await elevenLabsTTS(text);
    }
  } catch (error) {
    console.error("TTS generation error:", error);
    // Final fallback
    return await elevenLabsTTS(text);
  }
}

async function elevenLabsTTS(text) {
  const fileName = `${Date.now()}.mp3`;
  try {
    const response = await voice.textToSpeech({ fileName, textInput: text });
    return response.status === "ok" ? fileName : null;
  } catch (error) {
    console.error("ElevenLabs error:", error);
    return null;
  }
}

async function huggingFaceTTS(text, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/facebook/fastspeech2-en-ljspeech",
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGING_FACE_TOKEN}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          body: JSON.stringify({ inputs: text }),
        },
      );

      if (!response.ok) {
        if (response.status === 503) {
          console.log(
            `Attempt ${i + 1}/${maxRetries}: Service unavailable, retrying...`,
          );
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          continue;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const audioBuffer = await response.buffer();
      const fileName = path.join(__dirname, "temp", `${Date.now()}.wav`);
      await fs.promises.writeFile(fileName, audioBuffer);
      return fileName;
    } catch (error) {
      if (i === maxRetries - 1) {
        console.error("HuggingFace error after retries:", error);
        // Fallback to ElevenLabs if all retries fail
        console.log("Falling back to ElevenLabs TTS...");
        return await elevenLabsTTS(text);
      }
    }
  }
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

// Start the bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("Failed to start bot:", error);
  process.exit(1);
});
