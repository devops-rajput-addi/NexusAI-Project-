# DevOps MCP Hub - Docker Image
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Add labels for identification
LABEL org.opencontainers.image.title="DevOps MCP Hub"
LABEL org.opencontainers.image.description="AI-powered MCP server for Jira, GitHub, and Confluence integration"
LABEL org.opencontainers.image.version="2.0.0"
LABEL org.opencontainers.image.authors="CCTECH Hackathon Team"

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S mcpuser && \
    adduser -u 1001 -S mcpuser -G mcpuser

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R mcpuser:mcpuser /app

# Switch to non-root user
USER mcpuser

# Set environment defaults (these should be overridden at runtime)
ENV NODE_ENV=production

# Health check - verifies Node.js is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Entry point
CMD ["node", "dist/index.js"]

