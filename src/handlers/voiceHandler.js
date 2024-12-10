const {
  joinVoiceChannel,
  createAudioResource,
  createAudioPlayer,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType
} = require("@discordjs/voice");
const prism = require("prism-media");
const fs = require("fs");
const path = require("path");
const CONFIG = require("../config/config");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const logger = require("../utils/logger");

class VoiceHandler {
  constructor() {
    this.currentConnection = null;
    this.currentAudioStream = null;
    this.currentOpusDecoder = null;
    this.currentSilenceInterval = null;
  }

  cleanup() {
    if (this.currentSilenceInterval) {
      clearInterval(this.currentSilenceInterval);
      this.currentSilenceInterval = null;
    }
    if (this.currentAudioStream) {
      this.currentAudioStream.destroy();
      this.currentAudioStream = null;
    }
    if (this.currentOpusDecoder) {
      this.currentOpusDecoder.destroy();
      this.currentOpusDecoder = null;
    }
    this.currentConnection = null;
  }

  async joinVoiceChannel(channel, message) {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on(VoiceConnectionStatus.Ready, () => {
      logger.info('Voice connection ready', { 
        channelId: channel.id,
        guildId: channel.guild.id 
      });
      this.listenAndRespond(connection, connection.receiver, message);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch (error) {
        connection.destroy();
        this.cleanup();
      }
    });

    return connection;
  }

  async listenAndRespond(connection, receiver, message) {
    if (this.currentConnection) {
      this.cleanup();
    }

    this.currentConnection = connection;
    let isProcessing = false;
    let audioBuffer = Buffer.alloc(0);
    let silenceStart = null;
    let lastChunkTime = Date.now();

    this.currentAudioStream = receiver.subscribe(message.author.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 1000,
      },
    });

    this.currentOpusDecoder = new prism.opus.Decoder({
      rate: CONFIG.AUDIO_SETTINGS.sampleRate,
      channels: CONFIG.AUDIO_SETTINGS.channels,
      frameSize: CONFIG.AUDIO_SETTINGS.frameSize,
    });

    this.currentSilenceInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastChunkTime > CONFIG.AUDIO_SETTINGS.silenceThreshold && !silenceStart) {
        silenceStart = now;
      }

      if (silenceStart && 
          now - silenceStart > CONFIG.AUDIO_SETTINGS.silenceThreshold && 
          audioBuffer.length > 0 && 
          !isProcessing) {
        isProcessing = true;
        const currentBuffer = audioBuffer;
        audioBuffer = Buffer.alloc(0);

        this.processAudioBuffer(currentBuffer, connection, message)
          .catch(console.error)
          .finally(() => {
            isProcessing = false;
          });
      }
    }, 100);

    this.currentAudioStream
      .pipe(this.currentOpusDecoder)
      .on("data", async (chunk) => {
        lastChunkTime = Date.now();
        if (silenceStart) silenceStart = null;

        audioBuffer = Buffer.concat([audioBuffer, chunk]);

        if (audioBuffer.length > CONFIG.AUDIO_SETTINGS.sampleRate * 2 && !isProcessing) {
          isProcessing = true;
          const currentBuffer = audioBuffer;
          audioBuffer = Buffer.alloc(0);

          try {
            await this.processAudioBuffer(currentBuffer, connection, message);
          } catch (error) {
            logger.error("Error processing audio", { error: error.message });
          } finally {
            isProcessing = false;
          }
        }
      });
  }

  async processAudioBuffer(buffer, connection, message) {
    if (buffer.length < CONFIG.AUDIO_SETTINGS.minAudioSize) {
      return;
    }

    const wavFile = path.join(__dirname, '../../temp', `${Date.now()}.wav`);
    await this.createWavFile(buffer, wavFile);

    try {
      const transcription = await aiService.transcribeAudio(wavFile);
      if (!transcription) return;

      const settings = messageHandler.getUserSettings(message.author.id);
      const response = await aiService.handleResponse(transcription, settings);
      
      const audioPath = await ttsService.generateTTS(response, settings.ttsProvider);
      await this.playResponse(audioPath, connection);
      
      await message.channel.send(`You said: "${transcription}"\nResponse: ${response}`);
    } catch (error) {
      logger.error("Error processing audio buffer", { error: error.message });
      await message.channel.send("Sorry, I had trouble processing that audio.");
    } finally {
      fs.unlink(wavFile, (err) => {
        if (err) logger.error("Error deleting wav file", { error: err.message });
      });
    }
  }

  async playResponse(audioPath, connection) {
    return new Promise((resolve, reject) => {
      try {
        const player = createAudioPlayer();
        const resource = createAudioResource(audioPath, {
          inputType: StreamType.Arbitrary,
        });

        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
          fs.unlink(audioPath, (err) => {
            if (err) logger.error("Error deleting audio file", { error: err.message });
          });
          resolve();
        });

        player.on("error", (error) => {
          logger.error("Error playing audio", { error: error.message });
          reject(error);
        });
      } catch (error) {
        logger.error("Error setting up audio playback", { error: error.message });
        reject(error);
      }
    });
  }

  async createWavFile(buffer, filepath) {
    const wavWriter = new wav.FileWriter(filepath, {
      channels: CONFIG.AUDIO_SETTINGS.channels,
      sampleRate: CONFIG.AUDIO_SETTINGS.sampleRate,
    });

    return new Promise((resolve, reject) => {
      wavWriter.write(buffer);
      wavWriter.on("done", () => resolve(filepath));
      wavWriter.on("error", reject);
      wavWriter.end();
    });
  }
}

module.exports = new VoiceHandler();
