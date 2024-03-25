# Discord Voice Bot

This project is a Discord bot that can join voice channels, record audio, transcribe it, and respond with text-to-speech messages. It uses OpenAI for generating responses, AssemblyAI for transcribing audio, and ElevenLabs for converting text to speech.

## Prerequisites

Before you can run this bot, you need to have Node.js installed on your system. You can download it from [Node.js official website](https://nodejs.org/).

## Setup

1. Clone the repository to your local machine.
2. Navigate to the cloned directory.
3. Install the necessary dependencies by running `npm install`.

## Configuration

1. Rename the `.env.sample` file to `.env`.
2. Fill in the `.env` file with your API keys:
   - `OPENAI_API_KEY` with your OpenAI API key.
   - `ASSEMBLYAI_API_KEY` with your AssemblyAI API key.
   - `ELEVENLABS_API_KEY` with your ElevenLabs API key.
   - `DISCORD_TOKEN` with your Discord bot token.

## Running the Bot

To run the bot, use the following command in the terminal:
```
npm start
```
