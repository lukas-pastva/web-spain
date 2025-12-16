# Lightweight image with Chrome and all deps preinstalled for Puppeteer
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json ./
## Install ffmpeg for daily video generation
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy application source (context is src/)
COPY . .

# Non-root user provided by the Puppeteer image
USER pptruser

# Pre-install Chrome for Testing managed by Puppeteer, so runtime has a browser
# cached at /home/pptruser/.cache/puppeteer. This avoids "Could not find Chrome" errors.
RUN npx puppeteer browsers install chrome

ENV NODE_ENV=production \
    PORT=8080 \
    OUTPUT_DIR=/tmp/images

EXPOSE 8080
CMD ["node", "server.js"]
