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
    const settings = await settingsService.getServerSettings(message.guild.id);
    if (!settings) {
      logger.error('Server settings not found');
      return;
    }

    // Get the voice channel's text channel
    const voiceChannel = message.member.voice.channel;
    let textChannel = message.channel;

    try {
      // Create WAV file with error handling
      const wavFile = path.join(os.tmpdir(), `${Date.now()}.wav`);
      logger.info("Creating WAV file", {
        filepath: wavFile,
        bufferSize: buffer.length,
        userId: message.author.id,
        guildId: message.guild.id
      });

      try {
        await this.createWavFile(buffer, wavFile);
        
        if (!fs.existsSync(wavFile)) {
          throw new Error('WAV file creation failed');
        }
      } catch (wavError) {
        logger.error('Error creating WAV file:', { error: wavError.message });
        await textChannel.send({
          embeds: [{
            color: 0xFF6B6B,
            title: "🎤 Voice Processing Error",
            description: "I had trouble processing your voice input. Please try speaking again.",
            fields: [
              {
                name: "Troubleshooting Tips",
                value: "• Make sure your microphone is working properly\n• Try speaking a bit louder\n• Ensure there isn't too much background noise"
              }
            ]
          }]
        });
        return;
      }

      logger.logVoiceEvent('transcribe_start', message.author.id, message.guild.id);

      // Transcribe audio
      const transcription = await aiService.transcribeAudio(wavFile);
      
      if (!transcription || transcription.trim().length === 0) {
        await textChannel.send({
          embeds: [{
            color: 0xFFA500,
            title: "🎤 Voice Recognition Issue",
            description: "I couldn't understand what you said.",
            fields: [
              {
                name: "Tips for Better Recognition",
                value: "• Speak clearly and at a normal pace\n• Minimize background noise\n• Try to speak closer to your microphone"
              }
            ]
          }]
        });
        return;
      }

      // Show transcription in chat
      await textChannel.send({
        embeds: [{
          color: 0x4CAF50,
          description: `"${transcription}"`,
          author: {
            name: message.author.username,
            icon_url: message.author.displayAvatarURL()
          },
          footer: {
            text: "🎙️ Voice Input"
          }
        }]
      });

      logger.logVoiceEvent('transcribe_success', message.author.id, message.guild.id, {
        length: transcription.length
      });

      // Get AI response
      const aiResponse = await aiService.handleResponse(transcription, settings);
      
      if (!aiResponse) {
        throw new Error('Failed to get AI response');
      }

      // Send response in text chat
      await textChannel.send({
        content: `<@${message.author.id}>`,
        embeds: [{
          color: 0x0099ff,
          description: aiResponse,
          footer: {
            text: `🤖 AI Response • ${settings.model || "GPT35"}`
          }
        }]
      });

      // Generate and play TTS response asynchronously
      const audioPath = await ttsService.generateTTS(aiResponse, settings.ttsProvider, {
        isVoiceInput: true
      });
      this.playResponse(audioPath, connection);

    } catch (error) {
      logger.error("Error in voice processing", { 
        error: error.message,
        userId: message.author.id,
        guildId: message.guild.id
      });

      await textChannel.send({
        embeds: [{
          color: 0xFF6B6B,
          title: "❌ Voice Processing Error",
          description: "I encountered an error while processing your voice input.",
          fields: [
            {
              name: "What to Try",
              value: "• Wait a moment and try speaking again\n• Make sure you're speaking clearly\n• Try reconnecting to the voice channel if issues persist"
            }
          ]
        }]
      });
    } finally {
      // Clean up the temporary WAV file if it exists
      const wavFile = path.join(os.tmpdir(), `${Date.now()}.wav`);
      if (fs.existsSync(wavFile)) {
        try {
          await fs.promises.unlink(wavFile);
        } catch (unlinkError) {
          logger.error('Error deleting wav file:', { error: unlinkError.message });
        }
      }
    }
  }

  async createWavFile(buffer, filepath) {
    return new Promise((resolve, reject) => {
      try {
        const writer = new wav.FileWriter(filepath, {
          channels: 2,
          sampleRate: 48000,
          bitDepth: 16,
        });

        writer.on('error', (err) => {
          reject(err);
        });

        writer.on('finish', () => {
          // Verify the file was created
          if (fs.existsSync(filepath)) {
            resolve();
          } else {
            reject(new Error('WAV file was not created'));
          }
        });

        writer.write(buffer);
        writer.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  async playResponse(audioPath, connection) {
    try {
      logger.info("Playing audio response", { audioPath });
      
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const stats = fs.statSync(audioPath);
      if (stats.size === 0) {
        throw new Error(`Audio file is empty: ${audioPath}`);
      }

      const player = createAudioPlayer();
      const resource = createAudioResource(audioPath, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });

      if (!resource) {
        throw new Error('Failed to create audio resource');
      }

      resource.volume?.setVolume(1); // Set volume to 100%

      const subscription = connection.subscribe(player);
      if (!subscription) {
        throw new Error('Failed to subscribe to audio player');
      }

      player.on(AudioPlayerStatus.Playing, () => {
        logger.info("Started playing audio", { audioPath });
      });

      player.on(AudioPlayerStatus.Idle, () => {
        logger.info("Finished playing audio", { audioPath });
        try {
          fs.unlinkSync(audioPath); // Clean up the audio file
        } catch (error) {
          logger.warn("Failed to clean up audio file", { 
            error: error.message,
            audioPath 
          });
        }
        subscription.unsubscribe(); // Clean up subscription
        player.stop();
      });

      player.on('error', (error) => {
        logger.error('Error playing audio:', { 
          error: error.message,
          audioPath 
        });
        try {
          fs.unlinkSync(audioPath); // Clean up the audio file even on error
        } catch (unlinkError) {
          logger.warn("Failed to clean up audio file after error", { 
            error: unlinkError.message,
            audioPath 
          });
        }
        subscription.unsubscribe(); // Clean up subscription
      });

      player.play(resource);
    } catch (error) {
      logger.error('Error setting up audio playback:', { 
        error: error.message,
        audioPath 
      });
      try {
        fs.unlinkSync(audioPath); // Clean up the audio file on setup error
      } catch (unlinkError) {
        logger.warn("Failed to clean up audio file after setup error", { 
          error: unlinkError.message,
          audioPath 
        });
      }
    }
  }

  async joinVoiceChannel(channel) {
    return new Promise((resolve, reject) => {
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

        resolve(connection);
      } catch (error) {
        logger.error("Error joining voice channel", { 
          error: error.message,
          channelId: channel.id,
          guildId: channel.guild.id
        });
        reject(error);
      }
    });
  }

  async createVoiceConnection(channel) {
    return new Promise((resolve, reject) => {
      try {
        const connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
          selfDeaf: false,
        });

        // Clear any existing listeners to prevent memory leaks
        connection.removeAllListeners('stateChange');
        
        connection.on('stateChange', (oldState, newState) => {
          const oldNetworking = Reflect.get(oldState, 'networking');
          const newNetworking = Reflect.get(newState, 'networking');
          
          const networkStateChange = oldNetworking !== newNetworking;
          
          if (networkStateChange) {
            const newUdp = Reflect.get(newNetworking, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
          }
        });

        resolve(connection);
      } catch (error) {
        reject(error);
      }
    });
  }

  async startListening(connection, message) {
    try {
      const receiver = connection.receiver;
      const subscription = receiver.subscribe(message.member.id, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 1000, // Increase silence duration to 1 second
        },
      });

      let buffer = [];
      let lastPacketTime = Date.now();
      const PACKET_TIMEOUT = 2000; // 2 seconds timeout

      subscription.on('data', (data) => {
        buffer.push(data);
        lastPacketTime = Date.now();
      });

      subscription.on('end', async () => {
        const currentTime = Date.now();
        if (currentTime - lastPacketTime < PACKET_TIMEOUT && buffer.length > 0) {
          await this.processAudioBuffer(Buffer.concat(buffer), connection, message);
        }
        buffer = [];
        
        // Start listening again
        this.startListening(connection, message);
      });

      return subscription;
    } catch (error) {
      logger.error('Error starting voice subscription', {
        error: error.message,
        userId: message.author.id,
        guildId: message.guild.id,
      });
    }
  }
}

module.exports = new VoiceHandler();