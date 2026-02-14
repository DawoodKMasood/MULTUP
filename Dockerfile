# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies) for build
# Unset NODE_ENV to ensure devDependencies are installed
RUN NODE_ENV=development npm install

# Copy source code
COPY . .

# Build the application
RUN node ace build

# Production stage
FROM node:22-slim AS production

WORKDIR /app

# Install CA certificates for SSL/TLS verification
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

# Install PM2 globally
RUN npm install -g pm2

# Copy built application from builder
COPY --from=builder /app/build ./build

# Copy Vite build assets
COPY --from=builder /app/public/assets ./public/assets

# Copy package files for production install
COPY --from=builder /app/package*.json ./

# Copy PM2 ecosystem config
COPY --from=builder /app/ecosystem.config.cjs ./

# Install only production dependencies
RUN npm ci --production && npm cache clean --force

# Expose port
EXPOSE 3333

# Start with PM2
CMD ["pm2-runtime", "start", "ecosystem.config.cjs"]
