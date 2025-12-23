# DevOps MCP Hub - Windows Setup Script
# Run this script to quickly set up the MCP server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   DevOps MCP Hub - Quick Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js version
$nodeVersion = node -v 2>$null
if (-not $nodeVersion) {
    Write-Host "[ERROR] Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

$majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($majorVersion -lt 18) {
    Write-Host "[ERROR] Node.js version $nodeVersion is too old!" -ForegroundColor Red
    Write-Host "Please upgrade to Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Node.js $nodeVersion detected" -ForegroundColor Green

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install dependencies!" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# Build the project
Write-Host ""
Write-Host "Building TypeScript..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build successful" -ForegroundColor Green

# Check for .env file
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Split-Path -Parent $scriptPath

if (-not (Test-Path "$projectPath\.env")) {
    Write-Host ""
    Write-Host "[INFO] No .env file found. Creating from template..." -ForegroundColor Yellow
    
    if (Test-Path "$projectPath\env.example.txt") {
        Copy-Item "$projectPath\env.example.txt" "$projectPath\.env"
        Write-Host "[OK] Created .env file from template" -ForegroundColor Green
        Write-Host ""
        Write-Host "IMPORTANT: Edit .env file with your credentials before running!" -ForegroundColor Yellow
    } else {
        Write-Host "[WARNING] No template found. Please create .env manually." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Edit .env file with your Jira/GitHub/Confluence credentials" -ForegroundColor White
Write-Host "2. Add the server to your Cursor MCP configuration:" -ForegroundColor White
Write-Host ""
Write-Host "   Add to ~/.cursor/mcp.json:" -ForegroundColor Gray
Write-Host ""

$distPath = "$projectPath\dist\index.js" -replace '\\', '/'
Write-Host "   {" -ForegroundColor DarkGray
Write-Host "     `"mcpServers`": {" -ForegroundColor DarkGray
Write-Host "       `"devops-hub`": {" -ForegroundColor DarkGray
Write-Host "         `"command`": `"node`"," -ForegroundColor DarkGray
Write-Host "         `"args`": [`"$distPath`"]," -ForegroundColor DarkGray
Write-Host "         `"env`": { ... your environment variables ... }" -ForegroundColor DarkGray
Write-Host "       }" -ForegroundColor DarkGray
Write-Host "     }" -ForegroundColor DarkGray
Write-Host "   }" -ForegroundColor DarkGray
Write-Host ""
Write-Host "3. Restart Cursor to load the MCP server" -ForegroundColor White
Write-Host ""

