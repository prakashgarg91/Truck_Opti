# TruckOpti Production Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install root and frontend dependencies needed for the production build/runtime.
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci
RUN npm ci --prefix frontend

COPY . .
RUN npm --prefix frontend run build

ENV NODE_ENV=production
EXPOSE $PORT

CMD ["node", "server.js"]
