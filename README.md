# 🚀 DevOps MCP Hub

**AI-Powered Unified DevOps Integration for Jira, GitHub, and Confluence**

A comprehensive Model Context Protocol (MCP) server that enables AI assistants to seamlessly interact with your DevOps tools. Built for the CCTECH Hackathon.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-purple)

---

## ✨ Features

### 🔧 Core Integrations

| Platform | Features |
|----------|----------|
| **Jira** | Issues, Projects, Sprints, Comments, Attachments, Worklogs |
| **GitHub** | Repos, PRs, Commits, Branches, Actions, Releases |
| **Confluence** | Spaces, Pages, Search, Comments, Publishing |

### 🤖 AI-Powered Features

- **🏥 Sprint Health Analyzer** - Comprehensive sprint metrics with risk analysis and recommendations
- **🧠 Smart Issue Creator (NLP)** - Create issues from natural language with AI-suggested properties
- **📊 Team Workload Dashboard** - Visualize team capacity and identify bottlenecks
- **⏱️ Time Tracking** - Full worklog support with team summaries
- **📝 Release Notes Generator** - Auto-generate release notes from Jira + GitHub data

### 💬 MCP Prompts

Pre-built conversational workflows:
- Sprint Review Analysis
- Natural Language Issue Creation
- Team Standup Generation
- Workload Analysis
- Release Notes Generation

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to Jira (required) + GitHub/Confluence (optional)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/devops-mcp-hub.git
cd devops-mcp-hub

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Build
npm run build
```

### Configuration

Edit `.env` file with your credentials:

```env
# Jira (Required)
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=your_api_token

# GitHub (Optional)
GITHUB_TOKEN=your_github_token

# Confluence (Optional)
CONFLUENCE_BASE_URL=https://your-company.atlassian.net
CONFLUENCE_EMAIL=your.email@company.com
CONFLUENCE_API_TOKEN=your_api_token
```

### Add to Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "devops-hub": {
      "command": "node",
      "args": ["C:/path/to/devops-mcp-hub/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://your-company.atlassian.net",
        "JIRA_EMAIL": "your.email@company.com",
        "JIRA_API_TOKEN": "your_api_token",
        "GITHUB_TOKEN": "your_github_token",
        "CONFLUENCE_BASE_URL": "https://your-company.atlassian.net",
        "CONFLUENCE_EMAIL": "your.email@company.com",
        "CONFLUENCE_API_TOKEN": "your_api_token"
      }
    }
  }
}
```

---

## 🐳 Docker Deployment

### Build and Run

```bash
# Build Docker image
docker build -t devops-mcp-hub .

# Run with environment file
docker run --env-file .env devops-mcp-hub

# Or with docker-compose
docker-compose up -d
```

### Using Pre-built Image

```bash
# Pull from registry (when published)
docker pull your-registry/devops-mcp-hub:latest

# Run
docker run --env-file .env your-registry/devops-mcp-hub:latest
```

### For Teams

Share the Docker image with your team:

```bash
# Save image to file
docker save devops-mcp-hub:latest | gzip > devops-mcp-hub.tar.gz

# Load on another machine
gunzip -c devops-mcp-hub.tar.gz | docker load

# Run with their own .env file
docker run --env-file .env devops-mcp-hub:latest
```

---

## 📚 Available Tools

### Jira Tools

| Tool | Description |
|------|-------------|
| `get_issue` | Get issue details |
| `search_issues` | Search with JQL |
| `create_issue` | Create new issue |
| `update_issue` | Update issue |
| `delete_issue` | Delete issue |
| `transition_issue` | Change status |
| `add_comment` | Add comment |
| `get_comments` | Get comments |
| `assign_issue` | Assign to user |
| `get_projects` | List projects |
| `get_boards` | List boards |
| `get_sprints` | List sprints |
| `get_sprint_issues` | Sprint issues |
| `get_my_issues` | My assigned issues |
| `add_worklog` | Log time |
| `get_worklogs` | Get worklogs |
| `get_time_tracking` | Time tracking info |

### AI Analytics Tools

| Tool | Description |
|------|-------------|
| `analyze_sprint_health` | Sprint health with metrics |
| `get_workload_dashboard` | Team workload analysis |
| `analyze_issue_text` | NLP issue analysis |
| `create_smart_issue` | AI-powered issue creation |
| `generate_release_notes` | Auto-generate release notes |
| `get_team_worklogs` | Team time summary |

### GitHub Tools

| Tool | Description |
|------|-------------|
| `github_get_repos` | List repositories |
| `github_get_repo` | Repository details |
| `github_get_commits` | Get commits |
| `github_get_prs` | Get pull requests |
| `github_compare` | Compare branches |
| `github_get_file` | Get file content |
| `github_get_workflows` | GitHub Actions |
| `github_get_releases` | Get releases |

### Confluence Tools

| Tool | Description |
|------|-------------|
| `confluence_get_spaces` | List spaces |
| `confluence_get_page` | Get page |
| `confluence_search` | Search content |
| `confluence_create_page` | Create page |
| `confluence_get_space_pages` | Pages in space |
| `publish_release_notes_to_confluence` | Publish release notes |

---

## 💡 Usage Examples

### Sprint Health Analysis

```
Analyze the health of sprint 123 on board 456
```

The AI will provide:
- Health score (0-100)
- Issue breakdown
- Risk identification
- Actionable recommendations

### Smart Issue Creation

```
Create an issue: We need to fix the login page that crashes when users
enter special characters in the password field. This is urgent and
affecting production users.
```

AI automatically detects:
- Type: Bug
- Priority: Critical
- Labels: frontend, security
- Similar existing issues

### Release Notes Generation

```
Generate release notes for version 2.0.0 of project MYPROJ
```

Generates comprehensive release notes with:
- Features, improvements, bug fixes
- Breaking changes warnings
- Contributor acknowledgments
- GitHub statistics (if configured)

### Workload Dashboard

```
Show me the team workload for project MYPROJ
```

Provides:
- Per-member workload metrics
- Balance score
- Bottleneck identification
- Redistribution recommendations

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DevOps MCP Hub                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Jira      │  │   GitHub    │  │ Confluence  │         │
│  │   Client    │  │   Client    │  │   Client    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                  ┌───────▼───────┐                          │
│                  │  AI Analytics │                          │
│                  │    Engine     │                          │
│                  └───────┬───────┘                          │
│                          │                                  │
│         ┌────────────────┼────────────────┐                 │
│         │                │                │                 │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐         │
│  │   Sprint    │  │    Smart    │  │   Release   │         │
│  │   Health    │  │    Issue    │  │    Notes    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                     MCP Protocol Layer                       │
│              (Tools, Resources, Prompts)                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   AI Assistant  │
                    │  (Cursor, etc)  │
                    └─────────────────┘
```

---

## 🔐 Security

- **No hardcoded secrets** - All credentials via environment variables
- **Non-root Docker** - Runs as unprivileged user
- **Read-only filesystem** - Container filesystem is immutable
- **Input validation** - All inputs validated with Zod schemas
- **HTTPS only** - All API calls use secure connections

---

## 🛠️ Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Start production
npm start
```

### Project Structure

```
devops-mcp-hub/
├── src/
│   ├── index.ts           # Main MCP server
│   ├── jira-client.ts     # Jira API client
│   ├── github-client.ts   # GitHub API client
│   ├── confluence-client.ts # Confluence API client
│   └── ai-analytics.ts    # AI-powered analytics
├── dist/                  # Compiled output
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🏆 CCTECH Hackathon

Built with ❤️ for the CCTECH Hackathon by the DevOps MCP Hub Team

**Features Implemented:**
- ✅ Jira MCP Server with full CRUD operations
- ✅ GitHub Integration
- ✅ Confluence Integration  
- ✅ AI Sprint Health Analyzer
- ✅ Smart Issue Creator (NLP)
- ✅ Team Workload Dashboard
- ✅ Time Tracking (Worklogs)
- ✅ Release Notes Generator
- ✅ Docker Deployment
- ✅ Cross-platform support (Cloud + Server)

---

## 📞 Support

- Create an issue on GitHub
- Check existing documentation
- Review environment configuration
