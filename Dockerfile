# Dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder

LABEL stage=builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY package-lock.json ./

# Install all dependencies (including dev for building)
RUN npm ci && \
    npm cache clean --force

# Stage 2: Production
FROM node:20-alpine
# FIXED: Comment moved to its own line

# Install tini for better signal handling
RUN apk add --no-cache tini curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Create app directory
WORKDIR /app

# Copy package files and node_modules from builder
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads /app/logs /app/temp && \
    chown -R nodejs:nodejs /app/uploads /app/logs /app/temp && \
    chmod -R 755 /app/uploads /app/logs /app/temp

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5009

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5009/health || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "server.js"]