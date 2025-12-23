#!/usr/bin/env node
/**
 * DevOps MCP Hub - Unified AI-Powered Integration
 * 
 * A comprehensive Model Context Protocol server that integrates:
 * - Jira (Issues, Sprints, Projects)
 * - GitHub (Repos, PRs, Commits, Actions)
 * - Confluence (Wiki Pages, Documentation)
 * 
 * With AI-powered features:
 * - Sprint Health Analysis
 * - Smart Issue Creation (NLP)
 * - Team Workload Dashboard
 * - Time Tracking & Worklogs
 * - Release Notes Generation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { JiraClient, createJiraClientFromEnv } from './jira-client.js';
import { GitHubClient, createGitHubClientFromEnv } from './github-client.js';
import { ConfluenceClient, createConfluenceClientFromEnv } from './confluence-client.js';
import { AIAnalytics } from './ai-analytics.js';
import { DocsGenerator, createDocsGeneratorFromEnv } from './docs-generator.js';

// ==================== TOOL SCHEMAS ====================

// Jira Schemas
const GetIssueSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123) or issue ID'),
});

const SearchIssuesSchema = z.object({
  jql: z.string().describe('JQL query string to search for issues'),
  maxResults: z.number().optional().default(20).describe('Maximum number of results to return'),
});

const CreateIssueSchema = z.object({
  projectKey: z.string().describe('The project key (e.g., PROJ)'),
  summary: z.string().describe('The issue summary/title'),
  description: z.string().optional().describe('The issue description'),
  issueType: z.string().default('Task').describe('The issue type (e.g., Bug, Story, Task, Epic)'),
  priority: z.string().optional().describe('The priority (e.g., High, Medium, Low)'),
  labels: z.array(z.string()).optional().describe('Labels to add to the issue'),
});

const UpdateIssueSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
  summary: z.string().optional().describe('New summary/title'),
  description: z.string().optional().describe('New description'),
  priority: z.string().optional().describe('New priority'),
  labels: z.array(z.string()).optional().describe('New labels (replaces existing)'),
});

const TransitionIssueSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
  transitionName: z.string().describe('The name of the transition (e.g., "Done", "In Progress")'),
});

const AddCommentSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
  comment: z.string().describe('The comment text to add'),
});

const AssignIssueSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
  assignee: z.string().optional().describe('Account ID/username of the assignee, or empty to unassign'),
});

const GetSprintsSchema = z.object({
  boardId: z.number().describe('The board ID to get sprints from'),
});

const GetSprintIssuesSchema = z.object({
  sprintId: z.number().describe('The sprint ID to get issues from'),
});

const SearchUsersSchema = z.object({
  query: z.string().describe('Search query for finding users'),
});

const GetProjectSchema = z.object({
  projectKey: z.string().describe('The project key (e.g., PROJ)'),
});

// Worklog Schemas
const AddWorklogSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
  timeSpent: z.string().describe('Time spent (e.g., "2h 30m", "1d", "4h")'),
  comment: z.string().optional().describe('Work description'),
  started: z.string().optional().describe('Start time (ISO format)'),
});

const GetWorklogsSchema = z.object({
  issueKey: z.string().describe('The issue key (e.g., PROJ-123)'),
});

// AI Analytics Schemas
const SprintHealthSchema = z.object({
  sprintId: z.number().describe('The sprint ID to analyze'),
  boardId: z.number().optional().describe('The board ID (optional, for sprint name lookup)'),
});

const WorkloadDashboardSchema = z.object({
  projectKey: z.string().optional().describe('Filter by project key'),
  sprintId: z.number().optional().describe('Filter by sprint ID'),
});

const SmartIssueSchema = z.object({
  text: z.string().describe('Natural language description of the issue'),
  projectKey: z.string().describe('Project key to create the issue in'),
  type: z.string().optional().describe('Override suggested type'),
  priority: z.string().optional().describe('Override suggested priority'),
});

const AnalyzeIssueTextSchema = z.object({
  text: z.string().describe('Text to analyze'),
  projectKey: z.string().describe('Project key for context'),
});

const GenerateReleaseNotesSchema = z.object({
  projectKey: z.string().describe('Project key'),
  version: z.string().describe('Version number (e.g., "2.0.0")'),
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
  githubOwner: z.string().optional().describe('GitHub repo owner (optional)'),
  githubRepo: z.string().optional().describe('GitHub repo name (optional)'),
});

const TeamWorklogsSchema = z.object({
  projectKey: z.string().optional().describe('Filter by project'),
  sprintId: z.number().optional().describe('Filter by sprint'),
  startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
});

// GitHub Schemas
const GitHubRepoSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
});

const GitHubCommitsSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  branch: z.string().optional().describe('Branch name'),
  since: z.string().optional().describe('Since date (ISO format)'),
  limit: z.number().optional().describe('Max commits to return'),
});

const GitHubPRsSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  state: z.enum(['open', 'closed', 'all']).optional().describe('PR state filter'),
});

const GitHubCompareSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  base: z.string().describe('Base branch/commit'),
  head: z.string().describe('Head branch/commit'),
});

const GitHubFileSchema = z.object({
  owner: z.string().describe('Repository owner'),
  repo: z.string().describe('Repository name'),
  path: z.string().describe('File path'),
  ref: z.string().optional().describe('Branch/tag/commit ref'),
});

// Confluence Schemas
const ConfluencePageSchema = z.object({
  pageId: z.string().describe('Page ID'),
});

const ConfluenceSearchSchema = z.object({
  query: z.string().describe('Search query'),
  spaceKey: z.string().optional().describe('Limit to space'),
  limit: z.number().optional().describe('Max results'),
});

const ConfluenceCreatePageSchema = z.object({
  spaceKey: z.string().describe('Space key'),
  title: z.string().describe('Page title'),
  content: z.string().describe('Page content (HTML or markdown)'),
  parentId: z.string().optional().describe('Parent page ID'),
  format: z.enum(['storage', 'markdown']).optional().describe('Content format'),
});

const PublishReleaseNotesSchema = z.object({
  projectKey: z.string().describe('Jira project key'),
  version: z.string().describe('Version number'),
  spaceKey: z.string().describe('Confluence space key'),
  parentPageId: z.string().optional().describe('Parent page ID in Confluence'),
  startDate: z.string().optional().describe('Start date'),
  endDate: z.string().optional().describe('End date'),
});

// ==================== HELPER FUNCTIONS ====================

function formatIssue(issue: {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    reporter?: { displayName: string };
    issuetype: { name: string };
    project: { key: string; name: string };
    created: string;
    updated: string;
    labels?: string[];
  };
}): string {
  const fields = issue.fields;
  let description = '';
  
  if (fields.description) {
    if (typeof fields.description === 'string') {
      description = fields.description;
    } else if (typeof fields.description === 'object') {
      description = '[Rich text content]';
    }
  }

  return `
**${issue.key}**: ${fields.summary}

- **Status**: ${fields.status.name}
- **Type**: ${fields.issuetype.name}
- **Priority**: ${fields.priority?.name || 'None'}
- **Project**: ${fields.project.name} (${fields.project.key})
- **Assignee**: ${fields.assignee?.displayName || 'Unassigned'}
- **Reporter**: ${fields.reporter?.displayName || 'Unknown'}
- **Labels**: ${fields.labels?.join(', ') || 'None'}
- **Created**: ${fields.created}
- **Updated**: ${fields.updated}

**Description**:
${description || 'No description'}
`.trim();
}

function formatTime(seconds: number): string {
  if (!seconds || seconds === 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// ==================== MAIN SERVER ====================

async function main() {
  // Initialize clients
  let jiraClient: JiraClient;
  let githubClient: GitHubClient | null = null;
  let confluenceClient: ConfluenceClient | null = null;
  let aiAnalytics: AIAnalytics;
  
  try {
    jiraClient = createJiraClientFromEnv();
  } catch (error) {
    console.error('Failed to initialize Jira client:', error);
    console.error('\nRequired environment variables:');
    console.error('  - JIRA_BASE_URL: Your Jira instance URL');
    console.error('  - JIRA_API_TOKEN: Your Jira API token or PAT');
    console.error('  - JIRA_EMAIL: (Cloud only) Your Atlassian email');
    process.exit(1);
  }

  // Initialize optional clients
  githubClient = createGitHubClientFromEnv();
  confluenceClient = createConfluenceClientFromEnv();
  
  // Initialize AI Analytics
  aiAnalytics = new AIAnalytics(jiraClient, githubClient, confluenceClient);

  // Initialize Docs Generator (alternative to Confluence)
  const docsGenerator = createDocsGeneratorFromEnv(githubClient);

  const server = new Server(
    {
      name: 'devops-mcp-hub',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // ==================== RESOURCES ====================

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = [
        {
          uri: 'jira://projects',
        name: 'Jira Projects',
          description: 'List of all accessible Jira projects',
          mimeType: 'application/json',
        },
        {
          uri: 'jira://myself',
        name: 'Current Jira User',
        description: 'Information about the authenticated Jira user',
          mimeType: 'application/json',
        },
        {
          uri: 'jira://boards',
        name: 'Jira Boards',
          description: 'List of all Jira/Agile boards',
          mimeType: 'application/json',
        },
    ];

    if (githubClient) {
      resources.push({
        uri: 'github://repos',
        name: 'GitHub Repositories',
        description: 'List of accessible GitHub repositories',
          mimeType: 'application/json',
      });
      resources.push({
        uri: 'github://user',
        name: 'GitHub User',
        description: 'Current GitHub user information',
          mimeType: 'application/json',
      });
    }

    if (confluenceClient) {
      resources.push({
        uri: 'confluence://spaces',
        name: 'Confluence Spaces',
        description: 'List of accessible Confluence spaces',
          mimeType: 'application/json',
      });
    }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    // Jira resources
    if (uri === 'jira://projects') {
      const projects = await jiraClient.getProjects();
      return {
        contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
        }],
      };
    }

    if (uri === 'jira://myself') {
      const user = await jiraClient.getCurrentUser();
      return {
        contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(user, null, 2),
        }],
      };
    }

    if (uri === 'jira://boards') {
      const boards = await jiraClient.getBoards();
      return {
        contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(boards.values, null, 2),
        }],
      };
    }

    // GitHub resources
    if (uri === 'github://repos' && githubClient) {
      const repos = await githubClient.getRepositories();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(repos, null, 2),
        }],
      };
    }

    if (uri === 'github://user' && githubClient) {
      const user = await githubClient.getCurrentUser();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(user, null, 2),
        }],
      };
    }

    // Confluence resources
    if (uri === 'confluence://spaces' && confluenceClient) {
      const spaces = await confluenceClient.getSpaces();
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(spaces.results, null, 2),
        }],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });

  // ==================== PROMPTS ====================

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'sprint_review',
          description: 'Generate a comprehensive sprint review with health analysis',
          arguments: [
            { name: 'sprintId', description: 'Sprint ID to review', required: true },
            { name: 'boardId', description: 'Board ID for context', required: false },
          ],
        },
        {
          name: 'create_issue_from_description',
          description: 'Create a Jira issue from natural language description',
          arguments: [
            { name: 'description', description: 'Natural language issue description', required: true },
            { name: 'projectKey', description: 'Target project key', required: true },
          ],
        },
        {
          name: 'generate_release_notes',
          description: 'Generate release notes for a version',
          arguments: [
            { name: 'projectKey', description: 'Project key', required: true },
            { name: 'version', description: 'Version number', required: true },
          ],
        },
        {
          name: 'team_standup',
          description: 'Generate team standup summary with blockers and progress',
          arguments: [
            { name: 'projectKey', description: 'Project key', required: true },
          ],
        },
        {
          name: 'workload_analysis',
          description: 'Analyze team workload and provide recommendations',
          arguments: [
            { name: 'projectKey', description: 'Project key', required: false },
            { name: 'sprintId', description: 'Sprint ID', required: false },
          ],
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'sprint_review': {
        const sprintId = parseInt(args?.sprintId || '0');
        const boardId = args?.boardId ? parseInt(args.boardId) : undefined;
        
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Please analyze sprint ${sprintId} and provide:
1. Use the analyze_sprint_health tool to get sprint metrics
2. Summarize the key findings
3. Highlight any risks or blockers
4. Provide actionable recommendations
5. Compare progress against goals

Board ID for context: ${boardId || 'not provided'}`,
              },
          },
        ],
      };
    }

      case 'create_issue_from_description': {
      return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `I want to create a Jira issue in project ${args?.projectKey || '[PROJECT]'}. 
                
Description: ${args?.description || '[Please provide description]'}

Please:
1. Use analyze_issue_text to understand the issue
2. Review the suggestions and similar issues
3. Create the issue with appropriate type, priority, and labels
4. Confirm the created issue details`,
              },
          },
        ],
      };
    }

      case 'generate_release_notes': {
      return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Generate release notes for ${args?.projectKey || '[PROJECT]'} version ${args?.version || '[VERSION]'}.

Please:
1. Use the generate_release_notes tool
2. Format the output nicely
3. Highlight breaking changes and key features
4. Include contributor acknowledgments`,
              },
          },
        ],
      };
    }

      case 'team_standup': {
      return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Generate a team standup summary for project ${args?.projectKey || '[PROJECT]'}.

Please:
1. Search for issues updated in the last 24 hours
2. Identify blockers (issues with status 'Blocked' or high priority stale items)
3. List what was completed yesterday
4. List what's in progress today
5. Highlight any concerns or dependencies`,
              },
          },
        ],
      };
    }

      case 'workload_analysis': {
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Analyze team workload ${args?.projectKey ? `for project ${args.projectKey}` : ''} ${args?.sprintId ? `in sprint ${args.sprintId}` : ''}.

Please:
1. Use the get_workload_dashboard tool
2. Identify overloaded and underutilized team members
3. Suggest work redistribution
4. Flag any bottlenecks
5. Provide actionable recommendations`,
              },
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  // ==================== TOOLS ====================

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Define tool type for TypeScript
    type ToolDefinition = {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
      };
    };

    const tools: ToolDefinition[] = [
      // ===== JIRA CORE TOOLS =====
        {
          name: 'get_issue',
        description: 'Get details of a specific Jira issue',
          inputSchema: {
            type: 'object',
            properties: {
            issueKey: { type: 'string', description: 'Issue key (e.g., PROJ-123)' },
            },
            required: ['issueKey'],
          },
        },
        {
          name: 'search_issues',
        description: 'Search Jira issues using JQL',
          inputSchema: {
            type: 'object',
            properties: {
            jql: { type: 'string', description: 'JQL query' },
            maxResults: { type: 'number', description: 'Max results (default: 20)' },
            },
            required: ['jql'],
          },
        },
        {
          name: 'create_issue',
        description: 'Create a new Jira issue',
          inputSchema: {
            type: 'object',
            properties: {
            projectKey: { type: 'string' },
            summary: { type: 'string' },
            description: { type: 'string' },
            issueType: { type: 'string', default: 'Task' },
            priority: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['projectKey', 'summary'],
        },
      },
      {
        name: 'update_issue',
        description: 'Update an existing Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
            summary: { type: 'string' },
            description: { type: 'string' },
            priority: { type: 'string' },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'delete_issue',
        description: 'Delete a Jira issue (use with caution!)',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
          },
          required: ['issueKey'],
          },
        },
        {
        name: 'transition_issue',
        description: 'Move an issue to a different status',
          inputSchema: {
            type: 'object',
            properties: {
            issueKey: { type: 'string' },
            transitionName: { type: 'string' },
          },
          required: ['issueKey', 'transitionName'],
        },
      },
      {
        name: 'get_transitions',
        description: 'Get available transitions for an issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
            },
            required: ['issueKey'],
          },
        },
        {
        name: 'add_comment',
        description: 'Add a comment to an issue',
          inputSchema: {
            type: 'object',
            properties: {
            issueKey: { type: 'string' },
            comment: { type: 'string' },
          },
          required: ['issueKey', 'comment'],
        },
      },
      {
        name: 'get_comments',
        description: 'Get comments on an issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
            },
            required: ['issueKey'],
          },
        },
        {
        name: 'assign_issue',
        description: 'Assign an issue to a user',
          inputSchema: {
            type: 'object',
            properties: {
            issueKey: { type: 'string' },
            assignee: { type: 'string' },
          },
          required: ['issueKey'],
        },
      },
      {
        name: 'get_projects',
        description: 'Get all Jira projects',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_project',
        description: 'Get project details',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string' },
          },
          required: ['projectKey'],
          },
        },
        {
        name: 'search_users',
        description: 'Search for Jira users',
          inputSchema: {
            type: 'object',
            properties: {
            query: { type: 'string' },
              },
          required: ['query'],
            },
          },
      {
        name: 'get_boards',
        description: 'Get all Jira boards',
        inputSchema: { type: 'object', properties: {} },
        },
        {
        name: 'get_sprints',
        description: 'Get sprints for a board',
          inputSchema: {
            type: 'object',
            properties: {
            boardId: { type: 'number' },
          },
          required: ['boardId'],
        },
      },
      {
        name: 'get_sprint_issues',
        description: 'Get issues in a sprint',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'number' },
          },
          required: ['sprintId'],
          },
        },
        {
        name: 'get_my_issues',
        description: 'Get issues assigned to current user',
          inputSchema: {
            type: 'object',
            properties: {
            status: { type: 'string' },
          },
        },
      },
      {
        name: 'get_attachments',
        description: 'Get attachments on an issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
            },
            required: ['issueKey'],
          },
        },

      // ===== WORKLOG TOOLS =====
        {
        name: 'add_worklog',
        description: 'Log time worked on an issue',
          inputSchema: {
            type: 'object',
            properties: {
            issueKey: { type: 'string', description: 'Issue key' },
            timeSpent: { type: 'string', description: 'Time (e.g., "2h 30m")' },
            comment: { type: 'string', description: 'Work description' },
            started: { type: 'string', description: 'Start time (ISO)' },
          },
          required: ['issueKey', 'timeSpent'],
        },
      },
      {
        name: 'get_worklogs',
        description: 'Get worklogs for an issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string' },
            },
            required: ['issueKey'],
          },
        },
        {
        name: 'get_time_tracking',
        description: 'Get time tracking info for an issue',
          inputSchema: {
            type: 'object',
          properties: {
            issueKey: { type: 'string' },
          },
          required: ['issueKey'],
          },
        },
        {
        name: 'get_team_worklogs',
        description: 'Get worklog summary for team',
          inputSchema: {
            type: 'object',
            properties: {
            projectKey: { type: 'string' },
            sprintId: { type: 'number' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },

      // ===== AI ANALYTICS TOOLS =====
      {
        name: 'analyze_sprint_health',
        description: 'AI-powered sprint health analysis with metrics and recommendations',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'number', description: 'Sprint ID to analyze' },
            boardId: { type: 'number', description: 'Board ID (optional)' },
          },
          required: ['sprintId'],
          },
        },
        {
        name: 'get_workload_dashboard',
        description: 'Team workload analysis with balance metrics',
          inputSchema: {
            type: 'object',
            properties: {
            projectKey: { type: 'string' },
            sprintId: { type: 'number' },
          },
        },
      },
      {
        name: 'analyze_issue_text',
        description: 'NLP analysis of issue text for smart suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Issue description text' },
            projectKey: { type: 'string', description: 'Project for context' },
          },
          required: ['text', 'projectKey'],
          },
        },
        {
        name: 'create_smart_issue',
        description: 'Create issue with AI-suggested type, priority, and labels',
          inputSchema: {
            type: 'object',
          properties: {
            text: { type: 'string' },
            projectKey: { type: 'string' },
            type: { type: 'string' },
            priority: { type: 'string' },
          },
          required: ['text', 'projectKey'],
          },
        },
        {
        name: 'generate_release_notes',
        description: 'Generate comprehensive release notes',
          inputSchema: {
            type: 'object',
            properties: {
            projectKey: { type: 'string' },
            version: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            githubOwner: { type: 'string' },
            githubRepo: { type: 'string' },
          },
          required: ['projectKey', 'version'],
        },
      },
    ];

    // Add GitHub tools if available
    if (githubClient) {
      tools.push(
        {
          name: 'github_get_repos',
          description: 'Get GitHub repositories',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'github_get_repo',
          description: 'Get GitHub repository details',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_get_commits',
          description: 'Get repository commits',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              branch: { type: 'string' },
              since: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_get_prs',
          description: 'Get pull requests',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              state: { type: 'string', enum: ['open', 'closed', 'all'] },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_compare',
          description: 'Compare two branches/commits',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              base: { type: 'string' },
              head: { type: 'string' },
            },
            required: ['owner', 'repo', 'base', 'head'],
          },
        },
        {
          name: 'github_get_file',
          description: 'Get file content from repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
              path: { type: 'string' },
              ref: { type: 'string' },
            },
            required: ['owner', 'repo', 'path'],
          },
        },
        {
          name: 'github_get_workflows',
          description: 'Get GitHub Actions workflows',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_get_releases',
          description: 'Get repository releases',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string' },
              repo: { type: 'string' },
            },
            required: ['owner', 'repo'],
          },
        }
      );
    }

    // Add Confluence tools if available
    if (confluenceClient) {
      tools.push(
        {
          name: 'confluence_get_spaces',
          description: 'Get Confluence spaces',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'confluence_get_page',
          description: 'Get Confluence page',
          inputSchema: {
            type: 'object',
            properties: {
              pageId: { type: 'string' },
            },
            required: ['pageId'],
          },
        },
        {
          name: 'confluence_search',
          description: 'Search Confluence content',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              spaceKey: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['query'],
          },
        },
        {
          name: 'confluence_create_page',
          description: 'Create a Confluence page',
          inputSchema: {
            type: 'object',
            properties: {
              spaceKey: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              parentId: { type: 'string' },
              format: { type: 'string', enum: ['storage', 'markdown'] },
            },
            required: ['spaceKey', 'title', 'content'],
          },
        },
        {
          name: 'confluence_get_space_pages',
          description: 'Get pages in a Confluence space',
          inputSchema: {
            type: 'object',
            properties: {
              spaceKey: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['spaceKey'],
          },
        },
        {
          name: 'publish_release_notes_to_confluence',
          description: 'Generate and publish release notes to Confluence',
          inputSchema: {
            type: 'object',
            properties: {
              projectKey: { type: 'string' },
              version: { type: 'string' },
              spaceKey: { type: 'string' },
              parentPageId: { type: 'string' },
              startDate: { type: 'string' },
              endDate: { type: 'string' },
            },
            required: ['projectKey', 'version', 'spaceKey'],
          },
        }
      );
    }

    // ===== DOCUMENTATION TOOLS (Alternative to Confluence) =====
    // These always work - save to local files or GitHub
    tools.push(
      {
        name: 'save_sprint_report',
        description: 'Generate and save sprint report to local file or GitHub',
        inputSchema: {
          type: 'object',
          properties: {
            sprintId: { type: 'number', description: 'Sprint ID to analyze' },
            boardId: { type: 'number', description: 'Board ID (optional)' },
            saveToGitHub: { type: 'boolean', description: 'Save to GitHub repo instead of local' },
            githubOwner: { type: 'string', description: 'GitHub repo owner (if saving to GitHub)' },
            githubRepo: { type: 'string', description: 'GitHub repo name (if saving to GitHub)' },
            },
            required: ['sprintId'],
          },
        },
        {
        name: 'save_workload_report',
        description: 'Generate and save workload report to local file or GitHub',
          inputSchema: {
            type: 'object',
            properties: {
            projectKey: { type: 'string', description: 'Project key' },
            sprintId: { type: 'number', description: 'Sprint ID (optional)' },
            saveToGitHub: { type: 'boolean', description: 'Save to GitHub repo' },
            githubOwner: { type: 'string' },
            githubRepo: { type: 'string' },
              },
            },
          },
      {
        name: 'save_release_notes_to_file',
        description: 'Generate release notes and save to local file or GitHub (no Confluence needed)',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string' },
            version: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            saveToGitHub: { type: 'boolean' },
            githubOwner: { type: 'string' },
            githubRepo: { type: 'string' },
          },
          required: ['projectKey', 'version'],
        },
      },
      {
        name: 'save_doc_to_github',
        description: 'Save any markdown content directly to a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Document title' },
            content: { type: 'string', description: 'Markdown content' },
            owner: { type: 'string', description: 'GitHub repo owner' },
            repo: { type: 'string', description: 'GitHub repo name' },
            path: { type: 'string', description: 'Path in repo (default: docs/)' },
          },
          required: ['title', 'content', 'owner', 'repo'],
        },
      }
    );

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // ===== JIRA CORE TOOLS =====
      
      if (name === 'get_issue') {
          const { issueKey } = GetIssueSchema.parse(args);
          const issue = await jiraClient.getIssue(issueKey);
        return { content: [{ type: 'text', text: formatIssue(issue) }] };
      }

      if (name === 'search_issues') {
          const { jql, maxResults } = SearchIssuesSchema.parse(args);
          const result = await jiraClient.searchIssues(jql, maxResults);
          
          if (result.issues.length === 0) {
          return { content: [{ type: 'text', text: 'No issues found.' }] };
        }

        const list = result.issues
          .map(i => `- **${i.key}**: ${i.fields.summary} [${i.fields.status.name}]`)
            .join('\n');

        return { content: [{ type: 'text', text: `Found ${result.total} issues (showing ${result.issues.length}):\n\n${list}` }] };
      }

      if (name === 'create_issue') {
          const payload = CreateIssueSchema.parse(args);
          const result = await jiraClient.createIssue(payload);
        return { content: [{ type: 'text', text: `✅ Issue created: **${result.key}**` }] };
      }

      if (name === 'update_issue') {
          const { issueKey, ...updates } = UpdateIssueSchema.parse(args);
          await jiraClient.updateIssue(issueKey, updates);
        return { content: [{ type: 'text', text: `✅ Issue ${issueKey} updated!` }] };
      }

      if (name === 'delete_issue') {
          const { issueKey } = GetIssueSchema.parse(args);
          await jiraClient.deleteIssue(issueKey);
        return { content: [{ type: 'text', text: `✅ Issue ${issueKey} deleted!` }] };
      }

      if (name === 'transition_issue') {
          const { issueKey, transitionName } = TransitionIssueSchema.parse(args);
          const { transitions } = await jiraClient.getTransitions(issueKey);
        const transition = transitions.find(t => t.name.toLowerCase() === transitionName.toLowerCase());
          
          if (!transition) {
          return { content: [{ type: 'text', text: `❌ Transition "${transitionName}" not found. Available: ${transitions.map(t => t.name).join(', ')}` }] };
          }

          await jiraClient.transitionIssue(issueKey, transition.id);
        return { content: [{ type: 'text', text: `✅ ${issueKey} transitioned to "${transition.to.name}"` }] };
      }

      if (name === 'get_transitions') {
          const { issueKey } = GetIssueSchema.parse(args);
          const { transitions } = await jiraClient.getTransitions(issueKey);
        const list = transitions.map(t => `- **${t.name}** → ${t.to.name}`).join('\n');
        return { content: [{ type: 'text', text: `Available transitions for ${issueKey}:\n\n${list}` }] };
      }

      if (name === 'add_comment') {
          const { issueKey, comment } = AddCommentSchema.parse(args);
          await jiraClient.addComment(issueKey, comment);
        return { content: [{ type: 'text', text: `✅ Comment added to ${issueKey}` }] };
      }

      if (name === 'get_comments') {
          const { issueKey } = GetIssueSchema.parse(args);
          const { comments } = await jiraClient.getComments(issueKey);
          
          if (comments.length === 0) {
          return { content: [{ type: 'text', text: `No comments on ${issueKey}` }] };
        }

        const list = comments.map(c => {
          const body = typeof c.body === 'string' ? c.body : '[Rich text]';
              return `**${c.author.displayName}** (${c.created}):\n${body}`;
        }).join('\n\n---\n\n');
        
        return { content: [{ type: 'text', text: `Comments on ${issueKey}:\n\n${list}` }] };
      }

      if (name === 'assign_issue') {
          const { issueKey, assignee } = AssignIssueSchema.parse(args);
          await jiraClient.assignIssue(issueKey, assignee || null);
        return { content: [{ type: 'text', text: assignee ? `✅ ${issueKey} assigned!` : `✅ ${issueKey} unassigned!` }] };
      }

      if (name === 'get_projects') {
          const projects = await jiraClient.getProjects();
        const list = projects.map(p => `- **${p.key}**: ${p.name}`).join('\n');
        return { content: [{ type: 'text', text: `Found ${projects.length} projects:\n\n${list}` }] };
      }

      if (name === 'get_project') {
          const { projectKey } = GetProjectSchema.parse(args);
          const project = await jiraClient.getProject(projectKey);
        return { content: [{ type: 'text', text: `**${project.name}** (${project.key})\nType: ${project.projectTypeKey}` }] };
      }

      if (name === 'search_users') {
          const { query } = SearchUsersSchema.parse(args);
          const users = await jiraClient.searchUsers(query);
        const list = users.map(u => `- **${u.displayName}** (${u.emailAddress || u.name || 'N/A'})`).join('\n');
        return { content: [{ type: 'text', text: `Found ${users.length} users:\n\n${list}` }] };
      }

      if (name === 'get_boards') {
          const boards = await jiraClient.getBoards();
        const list = boards.values.map(b => `- **${b.name}** (ID: ${b.id}, Type: ${b.type})`).join('\n');
        return { content: [{ type: 'text', text: `Found ${boards.values.length} boards:\n\n${list}` }] };
      }

      if (name === 'get_sprints') {
          const { boardId } = GetSprintsSchema.parse(args);
          const sprints = await jiraClient.getSprints(boardId);
        const list = sprints.values.map(s => `- **${s.name}** (ID: ${s.id}, State: ${s.state})`).join('\n');
        return { content: [{ type: 'text', text: `Found ${sprints.values.length} sprints:\n\n${list}` }] };
      }

      if (name === 'get_sprint_issues') {
          const { sprintId } = GetSprintIssuesSchema.parse(args);
          const result = await jiraClient.getSprintIssues(sprintId);
          
          if (result.issues.length === 0) {
          return { content: [{ type: 'text', text: 'No issues in this sprint.' }] };
        }

        const list = result.issues
          .map(i => `- **${i.key}**: ${i.fields.summary} [${i.fields.status.name}]`)
            .join('\n');

        return { content: [{ type: 'text', text: `Sprint issues:\n\n${list}` }] };
      }

      if (name === 'get_my_issues') {
          const status = (args as { status?: string })?.status;
          let jql = 'assignee = currentUser()';
        if (status) jql += ` AND status = "${status}"`;
          jql += ' ORDER BY updated DESC';

          const result = await jiraClient.searchIssues(jql, 50);
          
          if (result.issues.length === 0) {
          return { content: [{ type: 'text', text: 'No issues assigned to you.' }] };
        }

        const list = result.issues
          .map(i => `- **${i.key}**: ${i.fields.summary} [${i.fields.status.name}]`)
            .join('\n');

        return { content: [{ type: 'text', text: `Your issues (${result.total}):\n\n${list}` }] };
      }

      if (name === 'get_attachments') {
        const { issueKey } = GetIssueSchema.parse(args);
        const attachments = await jiraClient.getAttachments(issueKey);
        
        if (attachments.length === 0) {
          return { content: [{ type: 'text', text: `No attachments on ${issueKey}` }] };
        }

        const list = attachments.map(a => 
          `- **${a.filename}** (${Math.round(a.size / 1024)}KB, ${a.mimeType})`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `📎 Attachments on ${issueKey}:\n\n${list}` }] };
      }

      // ===== WORKLOG TOOLS =====

      if (name === 'add_worklog') {
        const { issueKey, timeSpent, comment, started } = AddWorklogSchema.parse(args);
        await jiraClient.addWorklog(issueKey, timeSpent, { comment, started });
        return { content: [{ type: 'text', text: `✅ Logged ${timeSpent} on ${issueKey}` }] };
      }

      if (name === 'get_worklogs') {
        const { issueKey } = GetWorklogsSchema.parse(args);
        const { worklogs } = await jiraClient.getWorklogs(issueKey);
        
        if (worklogs.length === 0) {
          return { content: [{ type: 'text', text: `No worklogs on ${issueKey}` }] };
        }

        const list = worklogs.map(w => 
          `- **${w.author.displayName}**: ${w.timeSpent} (${w.started})`
        ).join('\n');
        
        const total = worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);
        
        return { content: [{ type: 'text', text: `⏱️ Worklogs on ${issueKey} (Total: ${formatTime(total)}):\n\n${list}` }] };
      }

      if (name === 'get_time_tracking') {
        const { issueKey } = GetWorklogsSchema.parse(args);
        const issue = await jiraClient.getIssueTimeTracking(issueKey);
        
        const f = issue.fields;
        const text = `⏱️ Time Tracking for ${issueKey}:

- **Original Estimate**: ${formatTime(f.timeoriginalestimate || 0)}
- **Time Spent**: ${formatTime(f.timespent || 0)}
- **Remaining**: ${formatTime(f.timeestimate || 0)}
- **Progress**: ${f.timeoriginalestimate ? Math.round(((f.timespent || 0) / f.timeoriginalestimate) * 100) : 0}%`;
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'get_team_worklogs') {
        const params = TeamWorklogsSchema.parse(args);
        const result = await aiAnalytics.getTeamWorklogs(params);
        
        let text = `⏱️ Team Worklogs Summary (Total: ${result.totalTimeLoggedFormatted})\n\n`;
        
        text += '**By User:**\n';
        for (const u of result.userBreakdown.slice(0, 10)) {
          text += `- ${u.user}: ${u.timeSpentFormatted}\n`;
        }
        
        text += '\n**Top Issues:**\n';
        for (const i of result.issueBreakdown.slice(0, 10)) {
          text += `- ${i.key}: ${i.timeSpentFormatted}\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      // ===== AI ANALYTICS TOOLS =====

      if (name === 'analyze_sprint_health') {
        const { sprintId, boardId } = SprintHealthSchema.parse(args);
        const health = await aiAnalytics.analyzeSprintHealth(sprintId, boardId);
        
        const statusEmoji = {
          excellent: '🟢',
          good: '🟡',
          'at-risk': '🟠',
          critical: '🔴',
        };

        let text = `# Sprint Health Analysis: ${health.sprintName}\n\n`;
        text += `## Overall Health: ${statusEmoji[health.healthStatus]} ${health.healthScore}/100 (${health.healthStatus.toUpperCase()})\n\n`;
        
        text += `### 📊 Issue Breakdown\n`;
        text += `- Total: ${health.issueBreakdown.total}\n`;
        text += `- Done: ${health.issueBreakdown.done} (${health.metrics.completionRate}%)\n`;
        text += `- In Progress: ${health.issueBreakdown.inProgress}\n`;
        text += `- To Do: ${health.issueBreakdown.todo}\n`;
        text += `- Blocked: ${health.issueBreakdown.blocked}\n\n`;
        
        text += `### 📈 Metrics\n`;
        text += `- Burndown: ${health.metrics.burndownHealth}\n`;
        text += `- Velocity Trend: ${health.metrics.velocityTrend}\n\n`;
        
        if (health.risks.length > 0) {
          text += `### ⚠️ Risks\n`;
          for (const risk of health.risks) {
            text += `- ${risk}\n`;
          }
          text += '\n';
        }
        
        text += `### 💡 Recommendations\n`;
        for (const rec of health.recommendations) {
          text += `- ${rec}\n`;
        }
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'get_workload_dashboard') {
        const params = WorkloadDashboardSchema.parse(args);
        const dashboard = await aiAnalytics.generateWorkloadDashboard(params.projectKey, params.sprintId);
        
        let text = `# 📊 Team Workload Dashboard\n\n`;
        text += `Generated: ${dashboard.generatedAt}\n`;
        text += `Team Size: ${dashboard.teamSize} | Total Issues: ${dashboard.totalIssues} | Avg Workload: ${dashboard.averageWorkload}\n`;
        text += `Balance Score: ${dashboard.balanceScore}/100\n\n`;
        
        text += `## 👥 Team Workload\n\n`;
        
        const statusEmoji = {
          underutilized: '🔵',
          optimal: '🟢',
          heavy: '🟡',
          overloaded: '🔴',
        };
        
        for (const member of dashboard.workloadDistribution) {
          text += `### ${statusEmoji[member.workloadStatus]} ${member.teamMember}\n`;
          text += `- Assigned: ${member.metrics.assignedIssues}\n`;
          text += `- In Progress: ${member.metrics.inProgressIssues}\n`;
          text += `- Status: ${member.workloadStatus}\n`;
          if (member.riskFactors.length > 0) {
            text += `- Risks: ${member.riskFactors.join(', ')}\n`;
          }
          text += '\n';
        }
        
        if (dashboard.bottlenecks.length > 0) {
          text += `## 🚧 Bottlenecks\n`;
          for (const b of dashboard.bottlenecks) {
            text += `- ${b}\n`;
          }
          text += '\n';
        }
        
        if (dashboard.recommendations.length > 0) {
          text += `## 💡 Recommendations\n`;
          for (const r of dashboard.recommendations) {
            text += `- ${r}\n`;
          }
        }
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'analyze_issue_text') {
        const { text, projectKey } = AnalyzeIssueTextSchema.parse(args);
        const analysis = await aiAnalytics.analyzeIssueText(text, projectKey);
        
        let output = `# 🤖 Smart Issue Analysis\n\n`;
        output += `## Suggested Properties\n`;
        output += `- **Type**: ${analysis.suggestedType}\n`;
        output += `- **Priority**: ${analysis.suggestedPriority}\n`;
        output += `- **Story Points**: ${analysis.estimatedStoryPoints}\n`;
        output += `- **Labels**: ${analysis.suggestedLabels.join(', ') || 'None'}\n\n`;
        
        if (analysis.similarIssues.length > 0) {
          output += `## 🔍 Similar Issues\n`;
          for (const similar of analysis.similarIssues) {
            output += `- **${similar.key}**: ${similar.summary}\n`;
          }
          output += '\n';
        }
        
        if (analysis.suggestions.length > 0) {
          output += `## 💡 Suggestions\n`;
          for (const s of analysis.suggestions) {
            output += `- ${s}\n`;
          }
        }
        
        return { content: [{ type: 'text', text: output }] };
      }

      if (name === 'create_smart_issue') {
        const { text, projectKey, type, priority } = SmartIssueSchema.parse(args);
        const result = await aiAnalytics.createSmartIssue(text, projectKey, { type, priority });
        
        let output = `✅ Issue Created: **${result.key}**\n\n`;
        output += `## AI Analysis Applied\n`;
        output += `- Type: ${result.analysis.suggestedType}\n`;
        output += `- Priority: ${result.analysis.suggestedPriority}\n`;
        output += `- Labels: ${result.analysis.suggestedLabels.join(', ') || 'None'}\n`;
        
        return { content: [{ type: 'text', text: output }] };
      }

      if (name === 'generate_release_notes') {
        const params = GenerateReleaseNotesSchema.parse(args);
        const notes = await aiAnalytics.generateReleaseNotes({
          projectKey: params.projectKey,
          version: params.version,
          startDate: params.startDate,
          endDate: params.endDate,
          includeGitHub: params.githubOwner && params.githubRepo 
            ? { owner: params.githubOwner, repo: params.githubRepo }
            : undefined,
        });
        
        return { content: [{ type: 'text', text: notes.markdownContent }] };
      }

      // ===== GITHUB TOOLS =====

      if (name === 'github_get_repos' && githubClient) {
        const repos = await githubClient.getRepositories();
        const list = repos.slice(0, 20).map(r => 
          `- **${r.full_name}**: ${r.description || 'No description'} (⭐ ${r.stargazers_count})`
        ).join('\n');
        return { content: [{ type: 'text', text: `Your repositories:\n\n${list}` }] };
      }

      if (name === 'github_get_repo' && githubClient) {
        const { owner, repo } = GitHubRepoSchema.parse(args);
        const repository = await githubClient.getRepository(owner, repo);
        
        const text = `# ${repository.full_name}

${repository.description || 'No description'}

- **Language**: ${repository.language || 'Unknown'}
- **Stars**: ${repository.stargazers_count}
- **Forks**: ${repository.forks_count}
- **Open Issues**: ${repository.open_issues_count}
- **Default Branch**: ${repository.default_branch}
- **URL**: ${repository.html_url}`;
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'github_get_commits' && githubClient) {
        const { owner, repo, branch, since, limit } = GitHubCommitsSchema.parse(args);
        const commits = await githubClient.getCommits(owner, repo, { 
          sha: branch, 
          since, 
          per_page: limit || 20 
        });
        
        const list = commits.map(c => 
          `- \`${c.sha.substring(0, 7)}\` ${c.commit.message.split('\n')[0]} (${c.commit.author.name})`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `Recent commits:\n\n${list}` }] };
      }

      if (name === 'github_get_prs' && githubClient) {
        const { owner, repo, state } = GitHubPRsSchema.parse(args);
        const prs = await githubClient.getPullRequests(owner, repo, state || 'open');
        
        const list = prs.slice(0, 20).map(pr => 
          `- #${pr.number} **${pr.title}** (${pr.state}) by ${pr.user.login}`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `Pull Requests:\n\n${list}` }] };
      }

      if (name === 'github_compare' && githubClient) {
        const { owner, repo, base, head } = GitHubCompareSchema.parse(args);
        const comparison = await githubClient.compareCommits(owner, repo, base, head);
        
        const text = `# Comparison: ${base}...${head}

- **Status**: ${comparison.status}
- **Ahead by**: ${comparison.ahead_by} commits
- **Behind by**: ${comparison.behind_by} commits
- **Total commits**: ${comparison.total_commits}
- **Files changed**: ${comparison.files.length}

## Changed Files:
${comparison.files.slice(0, 20).map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n')}`;
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'github_get_file' && githubClient) {
        const { owner, repo, path, ref } = GitHubFileSchema.parse(args);
        const file = await githubClient.getFileContent(owner, repo, path, ref);
        
        let content = 'Binary or large file';
        if (file.content && file.encoding === 'base64') {
          content = Buffer.from(file.content, 'base64').toString('utf-8');
        }
        
        return { content: [{ type: 'text', text: `# ${file.path}\n\n\`\`\`\n${content}\n\`\`\`` }] };
      }

      if (name === 'github_get_workflows' && githubClient) {
        const { owner, repo } = GitHubRepoSchema.parse(args);
        const { workflows } = await githubClient.getWorkflows(owner, repo);
        
        const list = workflows.map(w => 
          `- **${w.name}** (${w.state}) - ${w.path}`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `GitHub Actions Workflows:\n\n${list}` }] };
      }

      if (name === 'github_get_releases' && githubClient) {
        const { owner, repo } = GitHubRepoSchema.parse(args);
        const releases = await githubClient.getReleases(owner, repo);
        
        const list = releases.slice(0, 10).map(r => 
          `- **${r.tag_name}**: ${r.name || 'No name'} (${r.published_at})`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `Releases:\n\n${list}` }] };
      }

      // ===== CONFLUENCE TOOLS =====

      if (name === 'confluence_get_spaces' && confluenceClient) {
        const { results } = await confluenceClient.getSpaces();
        const list = results.map(s => `- **${s.key}**: ${s.name}`).join('\n');
        return { content: [{ type: 'text', text: `Confluence Spaces:\n\n${list}` }] };
      }

      if (name === 'confluence_get_page' && confluenceClient) {
        const { pageId } = ConfluencePageSchema.parse(args);
        const page = await confluenceClient.getPage(pageId);
        
        const text = `# ${page.title}

- **Space**: ${page.space.name} (${page.space.key})
- **Version**: ${page.version.number}
- **Last Updated**: ${page.version.when} by ${page.version.by.displayName}
- **URL**: ${page._links.webui}

---

${page.body?.storage?.value || 'No content'}`;
        
        return { content: [{ type: 'text', text }] };
      }

      if (name === 'confluence_search' && confluenceClient) {
        const { query, spaceKey, limit } = ConfluenceSearchSchema.parse(args);
        
        const results = spaceKey 
          ? await confluenceClient.searchInSpace(spaceKey, query, limit || 20)
          : await confluenceClient.search(`text ~ "${query}"`, limit || 20);
        
        const list = results.results.map(r => 
          `- **${r.content.title}** - ${r.excerpt?.substring(0, 100) || 'No excerpt'}...`
        ).join('\n');
        
        return { content: [{ type: 'text', text: `Search results (${results.totalSize} total):\n\n${list}` }] };
      }

      if (name === 'confluence_create_page' && confluenceClient) {
        const { spaceKey, title, content, parentId, format } = ConfluenceCreatePageSchema.parse(args);
        
        const processedContent = format === 'markdown' 
          ? ConfluenceClient.markdownToStorageFormat(content)
          : content;
        
        const page = await confluenceClient.createPage({
          spaceKey,
          title,
          content: processedContent,
          parentId,
        });
        
        return { content: [{ type: 'text', text: `✅ Page created: **${page.title}**\n\nURL: ${page._links.webui}` }] };
      }

      if (name === 'confluence_get_space_pages' && confluenceClient) {
        const spaceKey = (args as { spaceKey: string }).spaceKey;
        const limit = (args as { limit?: number }).limit || 50;
        const { results } = await confluenceClient.getSpacePages(spaceKey, limit);
        
        const list = results.map(p => `- **${p.title}** (v${p.version.number})`).join('\n');
        return { content: [{ type: 'text', text: `Pages in ${spaceKey}:\n\n${list}` }] };
      }

      if (name === 'publish_release_notes_to_confluence' && confluenceClient) {
        const params = PublishReleaseNotesSchema.parse(args);
        
        const notes = await aiAnalytics.generateReleaseNotes({
          projectKey: params.projectKey,
          version: params.version,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        
        const result = await aiAnalytics.publishReleaseNotesToConfluence(
          notes,
          params.spaceKey,
          params.parentPageId
        );
        
        return { content: [{ type: 'text', text: `✅ Release notes published to Confluence!\n\nPage ID: ${result.pageId}\nURL: ${result.url}` }] };
      }

      // ===== DOCUMENTATION TOOLS (No Confluence needed) =====

      if (name === 'save_sprint_report') {
        const sprintId = (args as { sprintId: number }).sprintId;
        const boardId = (args as { boardId?: number }).boardId;
        const saveToGitHub = (args as { saveToGitHub?: boolean }).saveToGitHub;
        const owner = (args as { githubOwner?: string }).githubOwner;
        const repo = (args as { githubRepo?: string }).githubRepo;

        // Get sprint health data
        const health = await aiAnalytics.analyzeSprintHealth(sprintId, boardId);
        
        // Generate report
        const doc = docsGenerator.generateSprintReport({
          sprintName: health.sprintName,
          sprintId: health.sprintId,
          healthScore: health.healthScore,
          healthStatus: health.healthStatus,
          completionRate: health.metrics.completionRate,
          issueBreakdown: health.issueBreakdown,
          risks: health.risks,
          recommendations: health.recommendations,
        });

        if (saveToGitHub && owner && repo && githubClient) {
          const result = await docsGenerator.saveToGitHub(doc, {
            owner,
            repo,
            path: 'docs/sprint-reports',
            commitMessage: `docs: Add sprint report for ${health.sprintName}`,
          });
          return { content: [{ type: 'text', text: `✅ Sprint report saved to GitHub!\n\n📄 **${doc.title}**\n🔗 URL: ${result.url}` }] };
        } else {
          const filepath = await docsGenerator.saveToLocal(doc);
          return { content: [{ type: 'text', text: `✅ Sprint report saved locally!\n\n📄 **${doc.title}**\n📁 File: ${filepath}` }] };
        }
      }

      if (name === 'save_workload_report') {
        const projectKey = (args as { projectKey?: string }).projectKey;
        const sprintId = (args as { sprintId?: number }).sprintId;
        const saveToGitHub = (args as { saveToGitHub?: boolean }).saveToGitHub;
        const owner = (args as { githubOwner?: string }).githubOwner;
        const repo = (args as { githubRepo?: string }).githubRepo;

        // Get workload data
        const dashboard = await aiAnalytics.generateWorkloadDashboard(projectKey, sprintId);
        
        // Generate report
        const doc = docsGenerator.generateWorkloadReport(dashboard);

        if (saveToGitHub && owner && repo && githubClient) {
          const result = await docsGenerator.saveToGitHub(doc, {
            owner,
            repo,
            path: 'docs/workload-reports',
            commitMessage: `docs: Add team workload report`,
          });
          return { content: [{ type: 'text', text: `✅ Workload report saved to GitHub!\n\n📄 **${doc.title}**\n🔗 URL: ${result.url}` }] };
        } else {
          const filepath = await docsGenerator.saveToLocal(doc);
          return { content: [{ type: 'text', text: `✅ Workload report saved locally!\n\n📄 **${doc.title}**\n📁 File: ${filepath}` }] };
        }
      }

      if (name === 'save_release_notes_to_file') {
        const projectKey = (args as { projectKey: string }).projectKey;
        const version = (args as { version: string }).version;
        const startDate = (args as { startDate?: string }).startDate;
        const endDate = (args as { endDate?: string }).endDate;
        const saveToGitHub = (args as { saveToGitHub?: boolean }).saveToGitHub;
        const owner = (args as { githubOwner?: string }).githubOwner;
        const repo = (args as { githubRepo?: string }).githubRepo;

        // Generate release notes
        const notes = await aiAnalytics.generateReleaseNotes({
          projectKey,
          version,
          startDate,
          endDate,
        });

        const doc = {
          title: `Release Notes - v${version}`,
          filename: `release-notes-v${version.replace(/\./g, '-')}`,
          content: notes.markdownContent,
          format: 'markdown' as const,
        };

        if (saveToGitHub && owner && repo && githubClient) {
          const result = await docsGenerator.saveToGitHub(doc, {
            owner,
            repo,
            path: 'docs/release-notes',
            commitMessage: `docs: Add release notes for v${version}`,
          });
          return { content: [{ type: 'text', text: `✅ Release notes saved to GitHub!\n\n📄 **${doc.title}**\n🔗 URL: ${result.url}\n\n${notes.markdownContent}` }] };
        } else {
          const filepath = await docsGenerator.saveToLocal(doc);
          return { content: [{ type: 'text', text: `✅ Release notes saved locally!\n\n📄 **${doc.title}**\n📁 File: ${filepath}\n\n${notes.markdownContent}` }] };
        }
      }

      if (name === 'save_doc_to_github') {
        if (!githubClient) {
          return { content: [{ type: 'text', text: '❌ GitHub not configured. Please set GITHUB_TOKEN.' }], isError: true };
        }

        const title = (args as { title: string }).title;
        const content = (args as { content: string }).content;
        const owner = (args as { owner: string }).owner;
        const repo = (args as { repo: string }).repo;
        const path = (args as { path?: string }).path || 'docs';

        const doc = docsGenerator.generateDocPage(title, content);
        
        const result = await docsGenerator.saveToGitHub(doc, {
          owner,
          repo,
          path,
          commitMessage: `docs: Add ${title}`,
        });

        return { content: [{ type: 'text', text: `✅ Document saved to GitHub!\n\n📄 **${title}**\n🔗 URL: ${result.url}` }] };
      }

      throw new Error(`Unknown tool: ${name}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: 'text', text: `❌ Error: ${message}` }], isError: true };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('🚀 DevOps MCP Hub running');
  console.error(`   Jira: ✅ Connected`);
  console.error(`   GitHub: ${githubClient ? '✅ Connected' : '⚪ Not configured'}`);
  console.error(`   Confluence: ${confluenceClient ? '✅ Connected' : '⚪ Not configured'}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
