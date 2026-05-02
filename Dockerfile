FROM node:24-bookworm-slim

WORKDIR /app

# better-sqlite3 may need native compilation during install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ curl yt-dlp chromium \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js ./
COPY public ./public
COPY views ./views

RUN mkdir -p /app/storage

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/storage/voting.sqlite

EXPOSE 3000

CMD ["npm", "start"]
