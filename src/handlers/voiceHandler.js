const {
  joinVoiceChannel,
  createAudioResource,
  createAudioPlayer,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType,
  entersState,
} = require("@discordjs/voice");
const prism = require("prism-media");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { CONFIG, RESPONSE_CONFIG } = require("../config/config");
const aiService = require("../services/aiService");
const ttsService = require("../services/ttsService");
const settingsService = require("../services/settingsService");
const { generateInitialResponse } = require("../utils/responseUtils");
const logger = require("../utils/logger");
const wav = require("wav");

class VoiceHandler {
  constructor() {
    this.currentConnection = null;
    this.currentAudioStream = null;
    this.currentOpusDecoder = null;
    this.currentSilenceInterval = null;
    this.requestQueue = [];
    this.isProcessingQueue = false;
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
  }

  async listenAndRespond(connection, receiver, message) {
    logger.logVoiceEvent('start_listening', message.author.id, message.guild.id, {
      channelId: message.channel.id
    });

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
          .catch(error => {
            logger.error("Error processing audio", { 
              error: error.message,
              userId: message.author.id,
              guildId: message.guild.id 
            });
          })
          .finally(() => {
            isProcessing = false;
          });
      }
    }, 100);

    this.currentAudioStream.pipe(this.currentOpusDecoder).on("data", async (chunk) => {
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
          logger.error("Error processing audio buffer", { 
            error: error.message,
            userId: message.author.id,
            guildId: message.guild.id
          });
        } finally {
          isProcessing = false;
        }
      }
    });

    this.currentAudioStream.on("end", () => {
      logger.logVoiceEvent('stream_end', message.author.id, message.guild.id);
      this.cleanup();
      setTimeout(() => {
        this.listenAndRespond(connection, receiver, message);
      }, 100);
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      logger.logVoiceEvent('disconnected', message.author.id, message.guild.id);
      this.cleanup();
    });
  }

  async processAudioBuffer(buffer, connection, message) {
    try {
      const wavFile = path.join(os.tmpdir(), `${Date.now()}.wav`);
      await this.createWavFile(buffer, wavFile);
      
      logger.logVoiceEvent('transcribe_start', message.author.id, message.guild.id);
      const transcription = await aiService.transcribeAudio(wavFile);
      
      if (!transcription) {
        logger.logVoiceEvent('transcribe_empty', message.author.id, message.guild.id);
        return;
      }

      logger.logVoiceEvent('transcribe_success', message.author.id, message.guild.id, {
        length: transcription.length
      });

      await message.channel.send({
        embeds: [{
          color: 0x4CAF50,
          description: transcription,
          author: {
            name: message.author.username,
            icon_url: message.author.displayAvatarURL()
          },
          footer: {
            text: "🎙️ Voice transcription"
          }
        }]
      });

      const settings = settingsService.getUserSettings(message.author.id);
      
      if (transcription.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD) {
        const thinkingResponse = RESPONSE_CONFIG.THINKING_RESPONSES[Math.floor(Math.random() * RESPONSE_CONFIG.THINKING_RESPONSES.length)];
        const audioPath = await ttsService.generateTTS(thinkingResponse, settings.ttsProvider);
        await this.playResponse(audioPath, connection);
      }

      const aiResponse = await aiService.handleResponse(transcription, settings);
      
      if (aiResponse.length > RESPONSE_CONFIG.LONG_RESPONSE_THRESHOLD && connection) {
        const summary = await aiService.handleResponse(`Summarize this in 2-3 sentences while keeping the main points: ${aiResponse}`, settings);
        const ttsResponse = `Here's a summary: ${summary}\nCheck the chat for the complete response.`;
        
        await message.channel.send(`🤖 Response:\n${aiResponse}`);
        
        const audioPath = await ttsService.generateTTS(ttsResponse, settings.ttsProvider);
        await this.playResponse(audioPath, connection);
      } else {
        await message.channel.send(`🤖 Response:\n${aiResponse}`);
        const audioPath = await ttsService.generateTTS(aiResponse, settings.ttsProvider);
        await this.playResponse(audioPath, connection);
      }

      fs.unlink(wavFile, (err) => {
        if (err) logger.error('Error deleting wav file:', { error: err.message });
      });
    } catch (error) {
      logger.error("Error processing audio buffer", { 
        error: error.message,
        userId: message.author.id,
        guildId: message.guild.id
      });
      await message.channel.send("Sorry, I had trouble processing that audio.");
    }
  }

  async createWavFile(buffer, filepath) {
    return new Promise((resolve, reject) => {
      const writer = new wav.FileWriter(filepath, {
        channels: CONFIG.AUDIO_SETTINGS.channels,
        sampleRate: CONFIG.AUDIO_SETTINGS.sampleRate,
        bitDepth: 16,
      });

      writer.write(buffer);
      writer.end();

      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });
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

  async joinVoiceChannel(channel) {
    try {
      logger.logVoiceEvent('joining_channel', channel.members.first()?.id, channel.guild.id, {
        channelId: channel.id
      });

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          logger.error("Voice connection recovery failed", {
            error: error.message,
            channelId: channel.id,
            guildId: channel.guild.id
          });
          connection.destroy();
        }
      });

      return connection;
    } catch (error) {
      logger.error("Error joining voice channel", { 
        error: error.message,
        channelId: channel.id,
        guildId: channel.guild.id
      });
      throw error;
    }
  }
}

module.exports = new VoiceHandler();