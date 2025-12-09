# Lightweight image with Chrome and all deps preinstalled for Puppeteer
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copy application source
COPY src ./src

# Non-root user provided by the Puppeteer image
USER pptruser

ENV NODE_ENV=production \
    PORT=8080 \
    OUTPUT_DIR=/tmp/images

EXPOSE 8080
CMD ["node", "src/server.js"]

