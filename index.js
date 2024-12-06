require('dotenv').config();
const { OpenAI } = require('openai');
const ElevenLabs = require('elevenlabs-node');
const { joinVoiceChannel, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus, createAudioPlayer, EndBehaviorType } = require('@discordjs/voice');
const { GatewayIntentBits } = require('discord-api-types/v10');
const { Events, Client } = require('discord.js');
const prism = require('prism-media');
const path = require('path');
const fs = require('fs');

// Initialize clients
const voice = new ElevenLabs({
    apiKey: process.env.ELEVENLABS_API_KEY
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const client = new Client({
    intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds],
});

client.on(Events.ClientReady, () => console.log('Ready!'));

client.on(Events.MessageCreate, async message => {
    if (message.content.toLowerCase() === '!join') {
        const channel = message.member?.voice.channel;
        if (channel) {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            connection.on(VoiceConnectionStatus.Ready, () => {
                message.reply(`Joined voice channel: ${channel.name}!`);
                listenAndRespond(connection, connection.receiver, message);
            });
        } else {
            message.reply('You need to join a voice channel first!');
        }
    }
});

async function listenAndRespond(connection, receiver, message) {
    let isProcessing = false;
    let audioBuffer = Buffer.alloc(0);
    let silenceStart = null;
    const SILENCE_THRESHOLD = 500; // 500ms of silence to trigger processing
    
    const audioStream = receiver.subscribe(message.author.id, {
        end: {
            behavior: EndBehaviorType.AfterSilence,
            duration: 1000
        },
    });

    const opusDecoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 1,
        frameSize: 960
    });

    let lastChunkTime = Date.now();

    audioStream.pipe(opusDecoder).on('data', async (chunk) => {
        // Reset silence detection on new audio
        lastChunkTime = Date.now();
        if (silenceStart) silenceStart = null;
        
        // Append new audio data
        audioBuffer = Buffer.concat([audioBuffer, chunk]);

        // Check if we've accumulated enough audio (about 1 second worth)
        if (audioBuffer.length > 48000 * 2 && !isProcessing) { // 1 second of 48kHz 16-bit audio
            isProcessing = true;
            
            const currentBuffer = audioBuffer;
            audioBuffer = Buffer.alloc(0); // Reset buffer

            try {
                await processAudioBuffer(currentBuffer, connection);
            } catch (error) {
                console.error('Error processing audio:', error);
            }

            isProcessing = false;
        }
    });

    // Handle silence detection
    const silenceCheckInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastChunkTime > SILENCE_THRESHOLD && !silenceStart) {
            silenceStart = now;
        }

        // If we've been silent for a while and have data, process it
        if (silenceStart && now - silenceStart > SILENCE_THRESHOLD && audioBuffer.length > 0 && !isProcessing) {
            isProcessing = true;
            
            const currentBuffer = audioBuffer;
            audioBuffer = Buffer.alloc(0);

            processAudioBuffer(currentBuffer, connection)
                .catch(console.error)
                .finally(() => {
                    isProcessing = false;
                });
        }
    }, 100);

    audioStream.on('end', async () => {
        clearInterval(silenceCheckInterval);
        
        // Process any remaining audio
        if (audioBuffer.length > 0 && !isProcessing) {
            try {
                await processAudioBuffer(audioBuffer, connection);
            } catch (error) {
                console.error('Error processing final audio:', error);
            }
        }
        
        // Restart listening
        listenAndRespond(connection, receiver, message);
    });
}

async function processAudioBuffer(buffer, connection) {
    if (buffer.length < 4800) { // Minimum size check (100ms of audio)
        return;
    }

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const wavFile = path.join(tempDir, `recording_${Date.now()}.wav`);
    
    try {
        // Create WAV file
        const header = Buffer.alloc(44);
        
        // WAV header
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + buffer.length, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(1, 22);
        header.writeUInt32LE(48000, 24);
        header.writeUInt32LE(48000 * 2, 28);
        header.writeUInt16LE(2, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(buffer.length, 40);

        await fs.promises.writeFile(wavFile, Buffer.concat([header, buffer]));

        // Transcribe
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(wavFile),
            model: "whisper-1",
            language: "en"
        });

        if (transcription.text.trim()) {
            console.log('Transcribed text:', transcription.text);

            // Get ChatGPT response
            const response = await openai.chat.completions.create({
                messages: [{ role: "user", content: transcription.text }],
                model: "gpt-3.5-turbo",
                max_tokens: 150
            });

            const responseText = response.choices[0].message.content.trim();
            console.log('ChatGPT response:', responseText);

            if (responseText) {
                const audioPath = await convertTextToSpeech(responseText);
                if (audioPath) {
                    const player = createAudioPlayer();
                    const resource = createAudioResource(audioPath, {
                        inputType: StreamType.Arbitrary,
                    });

                    player.play(resource);
                    connection.subscribe(player);

                    await new Promise((resolve) => {
                        player.on(AudioPlayerStatus.Idle, () => {
                            console.log('Finished playing audio response.');
                            player.stop();
                            resolve();
                        });
                    });

                    // Clean up files after playing
                    try {
                        fs.unlinkSync(audioPath);
                    } catch (err) {
                        console.error('Error cleaning up audio file:', err);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in processing:', error);
    } finally {
        // Clean up WAV file
        try {
            fs.unlinkSync(wavFile);
        } catch (err) {
            console.error('Error cleaning up wav file:', err);
        }
    }
}

async function convertTextToSpeech(text) {
    const fileName = `${Date.now()}.mp3`;
    try {
        const response = await voice.textToSpeech({ fileName, textInput: text });
        return response.status === 'ok' ? fileName : null;
    } catch (error) {
        console.error('Error with text-to-speech conversion:', error);
        return null;
    }
}

client.login(process.env.DISCORD_TOKEN);