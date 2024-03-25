require('dotenv').config();
const { OpenAI } = require('openai');
const { AssemblyAI } = require('assemblyai');
const ElevenLabs = require('elevenlabs-node');
const { joinVoiceChannel, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus, createAudioPlayer, EndBehaviorType, VoiceReceiver } = require('@discordjs/voice');
const {GatewayIntentBits } = require('discord-api-types/v10');
const { Events, Client } = require('discord.js');
const { createWriteStream } = require('node:fs');
const prism = require('prism-media');
const fs = require('fs');
const { generateDependencyReport } = require('@discordjs/voice');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

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


async function listenAndRespond(connection, receiver, message){
  const audioStream = receiver.subscribe(message.author.id, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: 1000,
    },
  });

  const opusEncoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
  
  
  
  const filename = `./recordings/${Date.now()}-${message.author.id}.pcm`;
  const out = createWriteStream(filename, { end: true });

  console.log(`Started recording ${filename}`);


  audioStream.pipe(opusEncoder).pipe(out);

  out.on('finish', () => {
    console.log(`Finished recording `);

    const mp3FilePath = `./recordings/${Date.now()}-${message.author.id}.mp3`;

    pcmToMp3(filename, mp3FilePath)
      .then(async (mp3FilePath) => {

        const transcription = await transcribeAudio(mp3FilePath);

        if (transcription) {
          // get chatgpt response
          const chatGPTResponse = await getChatGPTResponse(transcription);
          // convert the response from text to speech
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

      }
      })
      .catch((error) => {
        console.error('Error converting PCM to MP3 or transcribing:', error);
      });

  });

}


client.on(Events.ERROR, console.warn);

void client.login(process.env.DISCORD_TOKEN);


const pcmToMp3 = (pcmFilePath, mp3FilePath) => {
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn(ffmpeg, [
      '-f', 's16le', // PCM format
      '-ar', '48000', // Sample rate
      '-ac', '2', // Number of audio channels
      '-i', pcmFilePath, // Input file
      mp3FilePath // Output file
    ]);

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve(mp3FilePath);
      } else {
        reject(new Error(`ffmpeg process exited with code ${code}`));
      }
    });

    ffmpegProcess.on('error', reject);
  });
};



async function transcribeAudio(file) {
    try {
        
        const transcript = await assemblyAI.transcripts.transcribe({ audio: file });
        return transcript.text;
    } catch (error) {
        console.error('Error in transcription:', error);
        return "Hie there this means you failed";
    }
}


// Function to get response from ChatGPT
async function getChatGPTResponse(text) {
    try {
        const response = await openai.completions.create({
            model: "gpt-3.5-turbo-instruct-0914",
            prompt: text,
            max_tokens: 256,
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