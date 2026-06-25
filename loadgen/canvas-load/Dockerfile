FROM mcr.microsoft.com/playwright:v1.49.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8090 9091
CMD ["node", "dist/index.js", "--config", "/config/load.yaml"]
