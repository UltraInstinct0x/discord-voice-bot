# Dockerfile
FROM node:18-bullseye

# Install system dependencies including Python and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ffmpeg \
    git \
    # Dependencies for sodium-native
    autoconf \
    automake \
    libtool \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install --build-from-source

# Copy the rest of the application
COPY . .

# Create temp directory for audio files
RUN mkdir -p temp

# Start the bot
CMD [ "npm", "start" ]


