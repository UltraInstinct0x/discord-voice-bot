require('dotenv').config();
const { OpenAI } = require('openai');
const { AssemblyAI } = require('assemblyai');
const ElevenLabs = require('elevenlabs-node');
const { joinVoiceChannel, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus, createAudioPlayer, EndBehaviorType, VoiceReceiver } = require('@discordjs/voice');
const {GatewayIntentBits } = require('discord-api-types/v10');
const { Events, Client } = require('discord.js');
const prism = require('prism-media');
const { generateDependencyReport } = require('@discordjs/voice');

console.log(generateDependencyReport());

// Initialize ElevenLabs Client
const voice = new ElevenLabs({
    apiKey: process.env.ELEVENLABS_API_KEY,       // API key from Elevenlabs
});

// Initialize OpenAI Client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assemblyAI = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });

const client = new Client({
	intents: [GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,GatewayIntentBits.Guilds],
});

client.on(Events.ClientReady, () => console.log('Ready!'));

client.on(Events.MessageCreate, async message => {
  if (message.content.toLowerCase() === '!join') {
    if (message.member.voice.channel) {
      const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const receiver = connection.receiver;

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('The connection is ready to receive audio!');
        listenAndRespond(connection, receiver, message);
      });
    } else {
      message.reply('You need to join a voice channel first!');
    }
  }
});
  
async function listenAndRespond(connection, receiver, message) {

    var transcription =""
    // Set up the real-time transcriber
    const transcriber = assemblyAI.realtime.transcriber({
      sampleRate: 48000
    });
  
    transcriber.on('open', ({ sessionId }) => {
      console.log(`Real-time session opened with ID: ${sessionId}`);
    });
  
    transcriber.on('error', (error) => {
      console.error('Real-time transcription error:', error);
    });
  
    transcriber.on('close', (code, reason) => {
      console.log('Real-time session closed:', code, reason);
    });
  
    transcriber.on('transcript', async (transcript) => {
      if (transcript.message_type === 'FinalTranscript') {
        console.log('Final:', transcript.text);
        transcription += transcript.text + " "; // Append to the full message
      }
    });
  
    // Connect to the real-time transcription service
    await transcriber.connect();
  
    // Subscribe to the audio stream from the user
    const audioStream = receiver.subscribe(message.author.id, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 2000,
      },
    });
  
    // Convert the Discord Opus stream to a format suitable for AssemblyAI
    const opusDecoder = new prism.opus.Decoder({ rate: 48000, channels: 1});
  
    // Stream the audio to the real-time transcriber
    audioStream.pipe(opusDecoder).on('data', (chunk) => {
      transcriber.sendAudio(chunk);
    });

  
    // Handle disconnection
    audioStream.on('end', async () => {
      // Close the transcriber
      await transcriber.close();
      console.log("Final text:", transcription)
      const chatGPTResponse = await getChatGPTResponse(transcription);
      const audioPath = await convertTextToSpeech(chatGPTResponse);
      const audioResource = createAudioResource(audioPath, {
          inputType: StreamType.Arbitrary,
      });
      const player = createAudioPlayer();
      player.play(audioResource);
      connection.subscribe(player);
  
      player.on(AudioPlayerStatus.Idle, () => {
        console.log('Finished playing audio response.');
        player.stop();
          // listen for the next user query
        listenAndRespond(connection, receiver, message);
      });
    });
  }

client.on(Events.ERROR, console.warn);

void client.login(process.env.DISCORD_TOKEN);

// Function to get response from ChatGPT
async function getChatGPTResponse(text) {
    try {
        const response = await openai.completions.create({
            model: "gpt-3.5-turbo-instruct-0914",
            prompt: text,
            max_tokens: 100,
        });
        return response.choices[0].text.trim();
    } catch (error) {
        console.error('Error with ChatGPT:', error);
        return 'I am having trouble processing this right now.';
    }
}

// Function to convert text to speech using ElevenLabs
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