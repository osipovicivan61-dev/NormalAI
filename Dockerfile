FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
