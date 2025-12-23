/**
 * Confluence API Client
 * Handles all communication with Confluence REST API
 * Supports both Confluence Cloud and Confluence Server/Data Center
 */

interface ConfluenceConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  isCloud: boolean;
  defaultSpaceKey?: string; // Restrict operations to this space only
}

interface ConfluenceSpace {
  id: number;
  key: string;
  name: string;
  type: string;
  status: string;
  _links: {
    webui: string;
  };
}

interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  space: {
    key: string;
    name: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
    view?: {
      value: string;
    };
  };
  version: {
    number: number;
    when: string;
    by: {
      displayName: string;
    };
  };
  ancestors?: Array<{ id: string; title: string }>;
  _links: {
    webui: string;
    self: string;
  };
}

interface ConfluenceSearchResult {
  results: Array<{
    content: ConfluencePage;
    title: string;
    excerpt: string;
    url: string;
  }>;
  start: number;
  limit: number;
  size: number;
  totalSize: number;
}

interface CreatePagePayload {
  spaceKey: string;
  title: string;
  content: string;
  parentId?: string;
  contentFormat?: 'storage' | 'wiki';
}

interface UpdatePagePayload {
  title?: string;
  content?: string;
  contentFormat?: 'storage' | 'wiki';
  minorEdit?: boolean;
}

export class ConfluenceClient {
  private config: ConfluenceConfig;
  private headers: HeadersInit;
  private defaultSpaceKey: string | null;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    this.defaultSpaceKey = config.defaultSpaceKey || null;

    if (config.isCloud) {
      const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
      this.headers = {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
    } else {
      // Confluence Server with PAT
      this.headers = {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };
    }
  }

  /**
   * Get the configured default space key (if any)
   */
  getDefaultSpaceKey(): string | null {
    return this.defaultSpaceKey;
  }

  /**
   * Check if a space key is allowed (matches default space if configured)
   */
  isSpaceAllowed(spaceKey: string): boolean {
    if (!this.defaultSpaceKey) return true; // No restriction
    return spaceKey.toUpperCase() === this.defaultSpaceKey.toUpperCase();
  }

  /**
   * Validate space access - throws error if space is not allowed
   */
  private validateSpaceAccess(spaceKey: string): void {
    if (this.defaultSpaceKey && !this.isSpaceAllowed(spaceKey)) {
      throw new Error(`Access denied: Operations are restricted to space "${this.defaultSpaceKey}" only. Attempted to access space "${spaceKey}".`);
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Confluence Cloud uses /wiki/rest/api, Server uses /rest/api
    const apiPath = this.config.isCloud ? '/wiki/rest/api' : '/rest/api';
    const url = `${this.config.baseUrl}${apiPath}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Confluence API Error (${response.status}): ${errorText}`);
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  // ==================== SPACES ====================

  /**
   * Get all accessible spaces
   * If defaultSpaceKey is configured, only returns that space
   */
  async getSpaces(): Promise<{ results: ConfluenceSpace[] }> {
    if (this.defaultSpaceKey) {
      // Only return the configured space
      const space = await this.getSpace(this.defaultSpaceKey);
      return { results: [space] };
    }
    return this.request<{ results: ConfluenceSpace[] }>('/space?limit=100');
  }

  /**
   * Get a single space by key
   */
  async getSpace(spaceKey: string): Promise<ConfluenceSpace> {
    this.validateSpaceAccess(spaceKey);
    return this.request<ConfluenceSpace>(`/space/${spaceKey}`);
  }

  // ==================== PAGES ====================

  /**
   * Get a page by ID
   * Validates that the page belongs to the allowed space (if configured)
   */
  async getPage(pageId: string, expand: string[] = ['body.storage', 'version', 'space', 'ancestors']): Promise<ConfluencePage> {
    const expandParam = expand.join(',');
    const page = await this.request<ConfluencePage>(`/content/${pageId}?expand=${expandParam}`);
    
    // Validate page belongs to allowed space
    if (this.defaultSpaceKey && page.space) {
      this.validateSpaceAccess(page.space.key);
    }
    
    return page;
  }

  /**
   * Get pages in a space
   */
  async getSpacePages(spaceKey: string, limit: number = 50): Promise<{ results: ConfluencePage[] }> {
    this.validateSpaceAccess(spaceKey);
    return this.request<{ results: ConfluencePage[] }>(
      `/content?spaceKey=${spaceKey}&type=page&limit=${limit}&expand=version,space`
    );
  }

  /**
   * Create a new page
   * Uses defaultSpaceKey if configured and no spaceKey provided
   */
  async createPage(payload: CreatePagePayload): Promise<ConfluencePage> {
    // Use default space if not specified
    const spaceKey = payload.spaceKey || this.defaultSpaceKey;
    
    if (!spaceKey) {
      throw new Error('Space key is required. Either provide spaceKey or configure CONFLUENCE_SPACE_KEY.');
    }

    this.validateSpaceAccess(spaceKey);

    const body: Record<string, unknown> = {
      type: 'page',
      title: payload.title,
      space: { key: spaceKey },
      body: {
        storage: {
          value: payload.content,
          representation: payload.contentFormat || 'storage',
        },
      },
    };

    if (payload.parentId) {
      body.ancestors = [{ id: payload.parentId }];
    }

    return this.request<ConfluencePage>('/content', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update an existing page
   */
  async updatePage(pageId: string, payload: UpdatePagePayload): Promise<ConfluencePage> {
    // First get current page to get version number
    const currentPage = await this.getPage(pageId, ['version', 'space']);

    const body: Record<string, unknown> = {
      type: 'page',
      title: payload.title || currentPage.title,
      version: {
        number: currentPage.version.number + 1,
        minorEdit: payload.minorEdit || false,
      },
    };

    if (payload.content) {
      body.body = {
        storage: {
          value: payload.content,
          representation: payload.contentFormat || 'storage',
        },
      };
    }

    return this.request<ConfluencePage>(`/content/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * Delete a page
   */
  async deletePage(pageId: string): Promise<void> {
    await this.request(`/content/${pageId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get child pages
   */
  async getChildPages(pageId: string): Promise<{ results: ConfluencePage[] }> {
    return this.request<{ results: ConfluencePage[] }>(
      `/content/${pageId}/child/page?expand=version,space`
    );
  }

  // ==================== SEARCH ====================

  /**
   * Search for content using CQL (Confluence Query Language)
   * Automatically restricts to defaultSpaceKey if configured
   */
  async search(cql: string, limit: number = 25): Promise<ConfluenceSearchResult> {
    // If default space is configured, add space restriction to query
    let finalCql = cql;
    if (this.defaultSpaceKey) {
      // Add space restriction if not already present
      if (!cql.toLowerCase().includes('space =') && !cql.toLowerCase().includes('space=')) {
        finalCql = `space = "${this.defaultSpaceKey}" AND (${cql})`;
      }
    }

    const params = new URLSearchParams({
      cql: finalCql,
      limit: limit.toString(),
    });
    return this.request<ConfluenceSearchResult>(`/content/search?${params}`);
  }

  /**
   * Search within a specific space
   */
  async searchInSpace(spaceKey: string, text: string, limit: number = 25): Promise<ConfluenceSearchResult> {
    this.validateSpaceAccess(spaceKey);
    const cql = `space = "${spaceKey}" AND (title ~ "${text}" OR text ~ "${text}")`;
    return this.search(cql, limit);
  }

  // ==================== LABELS ====================

  /**
   * Get labels for a page
   */
  async getPageLabels(pageId: string): Promise<{ results: Array<{ name: string; prefix: string }> }> {
    return this.request<{ results: Array<{ name: string; prefix: string }> }>(`/content/${pageId}/label`);
  }

  /**
   * Add labels to a page
   */
  async addPageLabels(pageId: string, labels: string[]): Promise<void> {
    const body = labels.map(name => ({ prefix: 'global', name }));
    await this.request(`/content/${pageId}/label`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ==================== COMMENTS ====================

  /**
   * Get comments on a page
   */
  async getPageComments(pageId: string): Promise<{ results: Array<{
    id: string;
    title: string;
    body: { storage: { value: string } };
    version: { by: { displayName: string }; when: string };
  }> }> {
    return this.request(`/content/${pageId}/child/comment?expand=body.storage,version`);
  }

  /**
   * Add a comment to a page
   */
  async addPageComment(pageId: string, comment: string): Promise<unknown> {
    const body = {
      type: 'comment',
      container: { id: pageId, type: 'page' },
      body: {
        storage: {
          value: comment,
          representation: 'storage',
        },
      },
    };

    return this.request('/content', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ==================== HISTORY ====================

  /**
   * Get page history
   */
  async getPageHistory(pageId: string): Promise<{
    results: Array<{
      number: number;
      when: string;
      by: { displayName: string };
      message: string;
    }>;
  }> {
    return this.request(`/content/${pageId}/history`);
  }

  // ==================== ATTACHMENTS ====================

  /**
   * Get attachments for a page
   */
  async getPageAttachments(pageId: string): Promise<{ results: Array<{
    id: string;
    title: string;
    mediaType: string;
    fileSize: number;
    _links: { download: string };
  }> }> {
    return this.request(`/content/${pageId}/child/attachment`);
  }

  // ==================== USER ====================

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<{
    displayName: string;
    username: string;
    email: string;
  }> {
    return this.request('/user/current');
  }

  // ==================== UTILITY ====================

  /**
   * Convert plain text to Confluence storage format
   */
  static textToStorageFormat(text: string): string {
    // Escape HTML entities and convert newlines to <br/> tags
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    
    // Convert newlines to paragraphs
    const paragraphs = escaped.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
    
    return paragraphs;
  }

  /**
   * Convert markdown to basic Confluence storage format
   * (Simple conversion - for complex markdown, consider a proper library)
   */
  static markdownToStorageFormat(markdown: string): string {
    let html = markdown;
    
    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">$1</ac:parameter><ac:plain-text-body><![CDATA[$2]]></ac:plain-text-body></ac:structured-macro>');
    
    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Unordered lists
    html = html.replace(/^\* (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Paragraphs
    html = html.split('\n\n').map(block => {
      if (block.match(/^<(h[1-6]|ul|ol|ac:|p)/)) {
        return block;
      }
      return `<p>${block}</p>`;
    }).join('\n');
    
    return html;
  }
}

/**
 * Create a Confluence client from environment variables
 */
export function createConfluenceClientFromEnv(): ConfluenceClient | null {
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const email = process.env.CONFLUENCE_EMAIL || '';
  const apiToken = process.env.CONFLUENCE_API_TOKEN;
  const defaultSpaceKey = process.env.CONFLUENCE_SPACE_KEY;

  if (!baseUrl || !apiToken) {
    console.error('Confluence MCP: CONFLUENCE_BASE_URL or CONFLUENCE_API_TOKEN not set, Confluence features disabled');
    return null;
  }

  // Auto-detect Cloud vs Server
  const isCloudEnv = process.env.CONFLUENCE_IS_CLOUD;
  let isCloud: boolean;

  if (isCloudEnv !== undefined) {
    isCloud = isCloudEnv.toLowerCase() === 'true';
  } else {
    isCloud = baseUrl.includes('.atlassian.net');
  }

  if (isCloud && !email) {
    console.error('Confluence MCP: CONFLUENCE_EMAIL required for Confluence Cloud');
    return null;
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  
  console.error(`Confluence MCP: Connecting to ${isCloud ? 'Confluence Cloud' : 'Confluence Server'} at ${cleanBaseUrl}`);
  if (defaultSpaceKey) {
    console.error(`Confluence MCP: Restricted to space "${defaultSpaceKey}"`);
  }

  return new ConfluenceClient({ baseUrl: cleanBaseUrl, email, apiToken, isCloud, defaultSpaceKey });
}

