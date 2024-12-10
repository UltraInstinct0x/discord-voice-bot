FROM --platform=linux/arm64 node:18-bullseye-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ffmpeg \
    git \
    autoconf \
    automake \
    libtool \
    opus-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --build-from-source

# Create necessary directories
RUN mkdir -p temp logs

# Copy the rest of the application
COPY . .

# Create temp and logs directories in the correct location
RUN mkdir -p src/temp

# Expose the port
EXPOSE ${PORT}

# Start the bot
CMD ["npm", "start"]
