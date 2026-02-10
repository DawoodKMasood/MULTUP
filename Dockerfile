# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN node ace build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy built application
COPY --from=builder /app/build .
COPY --from=builder /app/ecosystem.config.cjs .

# Install production dependencies
RUN npm ci --production

# Expose port
EXPOSE 3333

# Start with PM2
CMD ["pm2-runtime", "ecosystem.config.cjs"]
