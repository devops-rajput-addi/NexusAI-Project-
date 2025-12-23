/**
 * Jira API Client
 * Handles all communication with Jira REST API
 */

interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  isCloud: boolean; // true for Jira Cloud, false for Jira Server/Data Center
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string | null;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; emailAddress: string } | null;
    reporter?: { displayName: string; emailAddress: string };
    issuetype: { name: string };
    project: { key: string; name: string };
    created: string;
    updated: string;
    labels?: string[];
    components?: Array<{ name: string }>;
  };
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  self: string;
}

interface JiraUser {
  accountId?: string;  // Cloud uses accountId
  name?: string;       // Server uses name/key
  key?: string;        // Server uses key
  displayName: string;
  emailAddress?: string;
  active: boolean;
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

interface JiraComment {
  id: string;
  author: { displayName: string };
  body: string | object;
  created: string;
  updated: string;
}

interface JiraAttachment {
  id: string;
  filename: string;
  author: { displayName: string; name?: string; emailAddress?: string };
  created: string;
  size: number;
  mimeType: string;
  content: string;  // URL to download the attachment
  thumbnail?: string;  // URL to thumbnail (for images)
}

interface SearchResult {
  issues: JiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

interface CreateIssuePayload {
  projectKey: string;
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
  assigneeId?: string;
  labels?: string[];
}

interface UpdateIssuePayload {
  summary?: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  labels?: string[];
}

export class JiraClient {
  private config: JiraConfig;
  private headers: HeadersInit;
  private apiVersion: string;

  constructor(config: JiraConfig) {
    this.config = config;
    
    // Jira Cloud uses Basic Auth with email:apiToken
    // Jira Server/Data Center uses Bearer token with PAT
    if (config.isCloud) {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    this.headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
      this.apiVersion = '3'; // Jira Cloud uses API v3
    } else {
      // Jira Server/Data Center with Personal Access Token
      this.headers = {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
      this.apiVersion = '2'; // Jira Server uses API v2
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}/rest/api/${this.apiVersion}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API Error (${response.status}): ${errorText}`);
    }

    // Handle empty responses (like 204 No Content)
    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  // ==================== ISSUES ====================

  /**
   * Get a single issue by key or ID
   */
  async getIssue(issueIdOrKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(`/issue/${issueIdOrKey}`);
  }

  /**
   * Search issues using JQL (Jira Query Language)
   */
  async searchIssues(jql: string, maxResults: number = 50, startAt: number = 0): Promise<SearchResult> {
    const params = new URLSearchParams({
      jql,
      maxResults: maxResults.toString(),
      startAt: startAt.toString(),
    });
    return this.request<SearchResult>(`/search?${params}`);
  }

  /**
   * Create a new issue
   */
  async createIssue(payload: CreateIssuePayload): Promise<{ id: string; key: string; self: string }> {
    const body: Record<string, unknown> = {
      fields: {
        project: { key: payload.projectKey },
        summary: payload.summary,
        issuetype: { name: payload.issueType },
      },
    };

    if (payload.description) {
      // Jira Cloud uses Atlassian Document Format (ADF), Jira Server uses plain text
      const descriptionValue = this.config.isCloud
        ? {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: payload.description }],
            },
          ],
          }
        : payload.description;

      body.fields = {
        ...(body.fields as Record<string, unknown>),
        description: descriptionValue,
      };
    }

    if (payload.priority) {
      body.fields = {
        ...(body.fields as Record<string, unknown>),
        priority: { name: payload.priority },
      };
    }

    if (payload.assigneeId) {
      // Cloud uses accountId, Server uses name
      const assigneeValue = this.config.isCloud
        ? { accountId: payload.assigneeId }
        : { name: payload.assigneeId };
      
      body.fields = {
        ...(body.fields as Record<string, unknown>),
        assignee: assigneeValue,
      };
    }

    if (payload.labels && payload.labels.length > 0) {
      body.fields = {
        ...(body.fields as Record<string, unknown>),
        labels: payload.labels,
      };
    }

    return this.request<{ id: string; key: string; self: string }>('/issue', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueIdOrKey: string, payload: UpdateIssuePayload): Promise<void> {
    const fields: Record<string, unknown> = {};

    if (payload.summary) {
      fields.summary = payload.summary;
    }

    if (payload.description) {
      // Jira Cloud uses Atlassian Document Format (ADF), Jira Server uses plain text
      fields.description = this.config.isCloud
        ? {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: payload.description }],
          },
        ],
          }
        : payload.description;
    }

    if (payload.priority) {
      fields.priority = { name: payload.priority };
    }

    if (payload.assigneeId) {
      // Cloud uses accountId, Server uses name
      fields.assignee = this.config.isCloud
        ? { accountId: payload.assigneeId }
        : { name: payload.assigneeId };
    }

    if (payload.labels) {
      fields.labels = payload.labels;
    }

    await this.request(`/issue/${issueIdOrKey}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
  }

  /**
   * Delete an issue
   */
  async deleteIssue(issueIdOrKey: string): Promise<void> {
    await this.request(`/issue/${issueIdOrKey}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(issueIdOrKey: string): Promise<{ transitions: JiraTransition[] }> {
    return this.request<{ transitions: JiraTransition[] }>(`/issue/${issueIdOrKey}/transitions`);
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueIdOrKey: string, transitionId: string): Promise<void> {
    await this.request(`/issue/${issueIdOrKey}/transitions`, {
      method: 'POST',
      body: JSON.stringify({
        transition: { id: transitionId },
      }),
    });
  }

  /**
   * Assign an issue to a user
   * @param issueIdOrKey - The issue key or ID
   * @param userIdentifier - accountId for Cloud, username for Server, or null to unassign
   */
  async assignIssue(issueIdOrKey: string, userIdentifier: string | null): Promise<void> {
    // Cloud uses accountId, Server uses name
    const assigneeBody = this.config.isCloud
      ? { accountId: userIdentifier }
      : { name: userIdentifier };

    await this.request(`/issue/${issueIdOrKey}/assignee`, {
      method: 'PUT',
      body: JSON.stringify(assigneeBody),
    });
  }

  // ==================== COMMENTS ====================

  /**
   * Get comments for an issue
   */
  async getComments(issueIdOrKey: string): Promise<{ comments: JiraComment[] }> {
    return this.request<{ comments: JiraComment[] }>(`/issue/${issueIdOrKey}/comment`);
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueIdOrKey: string, body: string): Promise<JiraComment> {
    // Jira Cloud uses Atlassian Document Format (ADF)
    // Jira Server uses plain text
    const commentBody = this.config.isCloud
      ? {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: body }],
            },
          ],
        },
        }
      : { body }; // Plain text for Jira Server

    return this.request<JiraComment>(`/issue/${issueIdOrKey}/comment`, {
      method: 'POST',
      body: JSON.stringify(commentBody),
    });
  }

  // ==================== ATTACHMENTS ====================

  /**
   * Get all attachments for an issue
   */
  async getAttachments(issueIdOrKey: string): Promise<JiraAttachment[]> {
    // Fetch issue with attachment field expanded
    const issue = await this.request<{ fields: { attachment: JiraAttachment[] } }>(
      `/issue/${issueIdOrKey}?fields=attachment`
    );
    return issue.fields.attachment || [];
  }

  /**
   * Get a single attachment by ID
   */
  async getAttachment(attachmentId: string): Promise<JiraAttachment> {
    return this.request<JiraAttachment>(`/attachment/${attachmentId}`);
  }

  /**
   * Delete an attachment
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.request(`/attachment/${attachmentId}`, {
      method: 'DELETE',
    });
  }

  // ==================== PROJECTS ====================

  /**
   * Get all projects
   */
  async getProjects(): Promise<JiraProject[]> {
    return this.request<JiraProject[]>('/project');
  }

  /**
   * Get a single project by key or ID
   */
  async getProject(projectIdOrKey: string): Promise<JiraProject> {
    return this.request<JiraProject>(`/project/${projectIdOrKey}`);
  }

  // ==================== USERS ====================

  /**
   * Search for users
   */
  async searchUsers(query: string): Promise<JiraUser[]> {
    // Cloud uses 'query' parameter, Server uses 'username' parameter
    const params = this.config.isCloud
      ? new URLSearchParams({ query })
      : new URLSearchParams({ username: query });
    return this.request<JiraUser[]>(`/user/search?${params}`);
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<JiraUser> {
    return this.request<JiraUser>('/myself');
  }

  /**
   * Get users assignable to a project
   */
  async getAssignableUsers(projectKey: string): Promise<JiraUser[]> {
    const params = new URLSearchParams({ project: projectKey });
    return this.request<JiraUser[]>(`/user/assignable/search?${params}`);
  }

  // ==================== SPRINTS (Agile) ====================

  /**
   * Get all boards
   */
  async getBoards(): Promise<{ values: Array<{ id: number; name: string; type: string }> }> {
    const url = `${this.config.baseUrl}/rest/agile/1.0/board`;
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira Agile API Error (${response.status}): ${errorText}`);
    }
    
    return response.json();
  }

  /**
   * Get sprints for a board
   */
  async getSprints(boardId: number): Promise<{ values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string }> }> {
    const url = `${this.config.baseUrl}/rest/agile/1.0/board/${boardId}/sprint`;
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira Agile API Error (${response.status}): ${errorText}`);
    }
    
    return response.json();
  }

  /**
   * Get issues in a sprint
   */
  async getSprintIssues(sprintId: number): Promise<{ issues: JiraIssue[] }> {
    const url = `${this.config.baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue`;
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira Agile API Error (${response.status}): ${errorText}`);
    }
    
    return response.json();
  }

  // ==================== ISSUE TYPES ====================

  /**
   * Get all issue types
   */
  async getIssueTypes(): Promise<Array<{ id: string; name: string; description: string }>> {
    return this.request<Array<{ id: string; name: string; description: string }>>('/issuetype');
  }

  /**
   * Get issue types for a project
   */
  async getProjectIssueTypes(projectIdOrKey: string): Promise<{ issueTypes: Array<{ id: string; name: string }> }> {
    const project = await this.request<{ issueTypes: Array<{ id: string; name: string }> }>(`/project/${projectIdOrKey}`);
    return project;
  }

  // ==================== PRIORITIES ====================

  /**
   * Get all priorities
   */
  async getPriorities(): Promise<Array<{ id: string; name: string; description: string }>> {
    return this.request<Array<{ id: string; name: string; description: string }>>('/priority');
  }

  // ==================== WORKLOGS ====================

  /**
   * Get worklogs for an issue
   */
  async getWorklogs(issueIdOrKey: string): Promise<{
    worklogs: Array<{
      id: string;
      author: { displayName: string; name?: string; emailAddress?: string };
      timeSpent: string;
      timeSpentSeconds: number;
      started: string;
      comment?: string | object;
    }>;
  }> {
    return this.request(`/issue/${issueIdOrKey}/worklog`);
  }

  /**
   * Add a worklog to an issue
   */
  async addWorklog(
    issueIdOrKey: string,
    timeSpent: string,
    options: {
      comment?: string;
      started?: string;
      adjustEstimate?: 'new' | 'leave' | 'manual' | 'auto';
      newEstimate?: string;
      reduceBy?: string;
    } = {}
  ): Promise<{ id: string; timeSpent: string }> {
    const body: Record<string, unknown> = {
      timeSpent,
    };

    if (options.comment) {
      // Plain text for Server, ADF for Cloud
      body.comment = this.config.isCloud
        ? {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: options.comment }] },
            ],
          }
        : options.comment;
    }

    if (options.started) {
      body.started = options.started;
    }

    const params = new URLSearchParams();
    if (options.adjustEstimate) {
      params.set('adjustEstimate', options.adjustEstimate);
      if (options.adjustEstimate === 'new' && options.newEstimate) {
        params.set('newEstimate', options.newEstimate);
      }
      if (options.adjustEstimate === 'manual' && options.reduceBy) {
        params.set('reduceBy', options.reduceBy);
      }
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';

    return this.request(`/issue/${issueIdOrKey}/worklog${queryString}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Delete a worklog
   */
  async deleteWorklog(issueIdOrKey: string, worklogId: string): Promise<void> {
    await this.request(`/issue/${issueIdOrKey}/worklog/${worklogId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get issue with time tracking fields
   */
  async getIssueTimeTracking(issueIdOrKey: string): Promise<{
    key: string;
    fields: {
      summary: string;
      timeoriginalestimate: number | null;
      timeestimate: number | null;
      timespent: number | null;
      aggregatetimeoriginalestimate: number | null;
      aggregatetimeestimate: number | null;
      aggregatetimespent: number | null;
    };
  }> {
    return this.request(`/issue/${issueIdOrKey}?fields=summary,timeoriginalestimate,timeestimate,timespent,aggregatetimeoriginalestimate,aggregatetimeestimate,aggregatetimespent`);
  }

  // ==================== STATUSES ====================

  /**
   * Get all statuses
   */
  async getStatuses(): Promise<Array<{ id: string; name: string; statusCategory: { name: string } }>> {
    return this.request<Array<{ id: string; name: string; statusCategory: { name: string } }>>('/status');
  }
}

/**
 * Create a Jira client from environment variables
 */
export function createJiraClientFromEnv(): JiraClient {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL || '';
  const apiToken = process.env.JIRA_API_TOKEN;

  // Auto-detect Jira Cloud vs Server/Data Center
  // Cloud URLs end with .atlassian.net
  // Can also be overridden with JIRA_IS_CLOUD=true/false
  const isCloudEnv = process.env.JIRA_IS_CLOUD;
  let isCloud: boolean;
  
  if (isCloudEnv !== undefined) {
    isCloud = isCloudEnv.toLowerCase() === 'true';
  } else {
    // Auto-detect based on URL
    isCloud = baseUrl?.includes('.atlassian.net') ?? false;
  }

  if (!baseUrl || !apiToken) {
    throw new Error(
      'Missing required Jira configuration. Please set JIRA_BASE_URL and JIRA_API_TOKEN environment variables.'
    );
  }
  
  // For Jira Cloud, email is required
  if (isCloud && !email) {
    throw new Error(
      'Missing JIRA_EMAIL. For Jira Cloud, please set JIRA_EMAIL environment variable.'
    );
  }

  // Remove trailing slash from base URL to avoid double slashes
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  
  console.error(`Jira MCP: Connecting to ${isCloud ? 'Jira Cloud' : 'Jira Server/Data Center'} at ${cleanBaseUrl}`);
  
  return new JiraClient({ baseUrl: cleanBaseUrl, email, apiToken, isCloud });
}

