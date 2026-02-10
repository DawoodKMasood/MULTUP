# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies) for build
# Using --include=dev to ensure devDependencies are installed regardless of NODE_ENV
RUN npm ci --include=dev

# Copy source code
COPY . .

# Build the application
RUN node ace build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy built application from builder
COPY --from=builder /app/build .

# Copy package files for production install
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --production && npm cache clean --force

# Expose port
EXPOSE 3333

# Start with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
