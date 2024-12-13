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

# Create necessary directories with correct permissions
RUN mkdir -p /usr/src/app/temp /usr/src/app/data/settings /usr/src/app/logs \
    && chown -R node:node /usr/src/app

# Switch to non-root user early
USER node

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm install --build-from-source

# Copy the source code and rest of the application
COPY --chown=node:node . .

# Ensure temp directory has correct permissions
RUN chmod 777 /usr/src/app/temp

# Start the bot
CMD ["npm", "start"]