/**
 * GitHub API Client
 * Handles all communication with GitHub REST API
 */

interface GitHubConfig {
  token: string;
  baseUrl: string; // For GitHub Enterprise, otherwise 'https://api.github.com'
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}

interface GitHubCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
  };
  html_url: string;
  author: {
    login: string;
    avatar_url: string;
  } | null;
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  labels: Array<{ name: string; color: string }>;
  draft: boolean;
  mergeable: boolean | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  html_url: string;
  author: {
    login: string;
  };
}

interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'disabled_manually' | 'disabled_inactivity';
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
}

interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  content?: string; // Base64 encoded content for files
  encoding?: string;
  html_url: string;
  download_url: string | null;
}

export class GitHubClient {
  private config: GitHubConfig;
  private headers: HeadersInit;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.headers = {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API Error (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  // ==================== REPOSITORIES ====================

  /**
   * Get repositories for the authenticated user
   */
  async getRepositories(type: 'all' | 'owner' | 'public' | 'private' | 'member' = 'all'): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>(`/user/repos?type=${type}&per_page=100`);
  }

  /**
   * Get a single repository
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.request<GitHubRepository>(`/repos/${owner}/${repo}`);
  }

  /**
   * Get repository branches
   */
  async getBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    return this.request<GitHubBranch[]>(`/repos/${owner}/${repo}/branches`);
  }

  // ==================== COMMITS ====================

  /**
   * Get commits for a repository
   */
  async getCommits(
    owner: string,
    repo: string,
    options: { sha?: string; since?: string; until?: string; per_page?: number } = {}
  ): Promise<GitHubCommit[]> {
    const params = new URLSearchParams();
    if (options.sha) params.set('sha', options.sha);
    if (options.since) params.set('since', options.since);
    if (options.until) params.set('until', options.until);
    params.set('per_page', (options.per_page || 30).toString());

    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/commits?${params}`);
  }

  /**
   * Get a single commit
   */
  async getCommit(owner: string, repo: string, sha: string): Promise<GitHubCommit & { files?: Array<{ filename: string; status: string; additions: number; deletions: number }> }> {
    return this.request<GitHubCommit & { files?: Array<{ filename: string; status: string; additions: number; deletions: number }> }>(`/repos/${owner}/${repo}/commits/${sha}`);
  }

  /**
   * Compare two commits
   */
  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<{
    status: string;
    ahead_by: number;
    behind_by: number;
    total_commits: number;
    commits: GitHubCommit[];
    files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
  }> {
    return this.request(`/repos/${owner}/${repo}/compare/${base}...${head}`);
  }

  // ==================== PULL REQUESTS ====================

  /**
   * Get pull requests for a repository
   */
  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<GitHubPullRequest[]> {
    return this.request<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`);
  }

  /**
   * Get a single pull request
   */
  async getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  /**
   * Get commits in a pull request
   */
  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<GitHubCommit[]> {
    return this.request<GitHubCommit[]>(`/repos/${owner}/${repo}/pulls/${number}/commits`);
  }

  /**
   * Get files changed in a pull request
   */
  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<Array<{
    sha: string;
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/files`);
  }

  // ==================== ISSUES ====================

  /**
   * Get issues for a repository
   */
  async getIssues(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<GitHubIssue[]> {
    return this.request<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=${state}&per_page=100`);
  }

  /**
   * Create an issue
   */
  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body?: string,
    labels?: string[]
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title, body, labels }),
    });
  }

  // ==================== RELEASES ====================

  /**
   * Get releases for a repository
   */
  async getReleases(owner: string, repo: string): Promise<GitHubRelease[]> {
    return this.request<GitHubRelease[]>(`/repos/${owner}/${repo}/releases`);
  }

  /**
   * Get the latest release
   */
  async getLatestRelease(owner: string, repo: string): Promise<GitHubRelease> {
    return this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases/latest`);
  }

  /**
   * Create a release
   */
  async createRelease(
    owner: string,
    repo: string,
    tagName: string,
    options: {
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      target_commitish?: string;
    } = {}
  ): Promise<GitHubRelease> {
    return this.request<GitHubRelease>(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tagName,
        ...options,
      }),
    });
  }

  // ==================== WORKFLOWS (Actions) ====================

  /**
   * Get workflows for a repository
   */
  async getWorkflows(owner: string, repo: string): Promise<{ workflows: GitHubWorkflow[] }> {
    return this.request<{ workflows: GitHubWorkflow[] }>(`/repos/${owner}/${repo}/actions/workflows`);
  }

  /**
   * Get workflow runs
   */
  async getWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: number,
    options: { status?: string; per_page?: number } = {}
  ): Promise<{ workflow_runs: GitHubWorkflowRun[] }> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    params.set('per_page', (options.per_page || 30).toString());

    const endpoint = workflowId
      ? `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${params}`
      : `/repos/${owner}/${repo}/actions/runs?${params}`;

    return this.request(endpoint);
  }

  // ==================== FILES ====================

  /**
   * Get file content from repository
   */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<GitHubFileContent> {
    const params = ref ? `?ref=${ref}` : '';
    return this.request<GitHubFileContent>(`/repos/${owner}/${repo}/contents/${path}${params}`);
  }

  /**
   * Get directory contents
   */
  async getDirectoryContents(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubFileContent[]> {
    const params = ref ? `?ref=${ref}` : '';
    return this.request<GitHubFileContent[]>(`/repos/${owner}/${repo}/contents/${path}${params}`);
  }

  /**
   * Search code in repositories
   */
  async searchCode(query: string, options: { repo?: string; language?: string; per_page?: number } = {}): Promise<{
    total_count: number;
    items: Array<{
      name: string;
      path: string;
      sha: string;
      html_url: string;
      repository: { full_name: string };
      text_matches?: Array<{ fragment: string }>;
    }>;
  }> {
    let q = query;
    if (options.repo) q += ` repo:${options.repo}`;
    if (options.language) q += ` language:${options.language}`;

    const params = new URLSearchParams({ q });
    params.set('per_page', (options.per_page || 30).toString());

    return this.request(`/search/code?${params}`);
  }

  // ==================== CONTRIBUTORS ====================

  /**
   * Get repository contributors
   */
  async getContributors(owner: string, repo: string): Promise<Array<{
    login: string;
    avatar_url: string;
    contributions: number;
    html_url: string;
  }>> {
    return this.request(`/repos/${owner}/${repo}/contributors`);
  }

  // ==================== USER ====================

  /**
   * Get authenticated user
   */
  async getCurrentUser(): Promise<{
    login: string;
    name: string;
    email: string;
    avatar_url: string;
    html_url: string;
  }> {
    return this.request('/user');
  }
}

/**
 * Create a GitHub client from environment variables
 */
export function createGitHubClientFromEnv(): GitHubClient | null {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    console.error('GitHub MCP: GITHUB_TOKEN not set, GitHub features disabled');
    return null;
  }

  // Support GitHub Enterprise
  const baseUrl = process.env.GITHUB_BASE_URL || 'https://api.github.com';
  
  console.error(`GitHub MCP: Connecting to ${baseUrl}`);
  
  return new GitHubClient({ token, baseUrl });
}

