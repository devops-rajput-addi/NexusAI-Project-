#!/bin/bash
# DevOps MCP Hub - Unix/Mac Setup Script
# Run this script to quickly set up the MCP server

echo "========================================"
echo "   DevOps MCP Hub - Quick Setup"
echo "========================================"
echo ""

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "[ERROR] Node.js version $(node -v) is too old!"
    echo "Please upgrade to Node.js 18+ from https://nodejs.org"
    exit 1
fi

echo "[OK] Node.js $(node -v) detected"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install dependencies!"
    exit 1
fi

echo "[OK] Dependencies installed"

# Build the project
echo ""
echo "Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "[ERROR] Build failed!"
    exit 1
fi

echo "[OK] Build successful"

# Check for .env file
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo ""
    echo "[INFO] No .env file found. Creating from template..."
    
    if [ -f "$PROJECT_DIR/env.example.txt" ]; then
        cp "$PROJECT_DIR/env.example.txt" "$PROJECT_DIR/.env"
        echo "[OK] Created .env file from template"
        echo ""
        echo "IMPORTANT: Edit .env file with your credentials before running!"
    else
        echo "[WARNING] No template found. Please create .env manually."
    fi
fi

echo ""
echo "========================================"
echo "   Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Jira/GitHub/Confluence credentials"
echo "2. Add the server to your Cursor MCP configuration:"
echo ""
echo "   Add to ~/.cursor/mcp.json:"
echo ""
echo "   {"
echo "     \"mcpServers\": {"
echo "       \"devops-hub\": {"
echo "         \"command\": \"node\","
echo "         \"args\": [\"$PROJECT_DIR/dist/index.js\"],"
echo "         \"env\": { ... your environment variables ... }"
echo "       }"
echo "     }"
echo "   }"
echo ""
echo "3. Restart Cursor to load the MCP server"
echo ""

