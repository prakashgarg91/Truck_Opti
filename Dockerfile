# TruckOpti Production Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm install
RUN cd frontend && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd frontend && npm run build

# Install serve for production
RUN npm install -g serve

# Expose port
EXPOSE $PORT

# Start command
CMD cd frontend/dist && serve -s -l $PORT
