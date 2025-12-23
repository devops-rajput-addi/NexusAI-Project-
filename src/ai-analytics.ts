/**
 * AI-Powered Analytics Module
 * Provides intelligent analysis and automation for DevOps workflows
 */

import { JiraClient } from './jira-client.js';
import { GitHubClient } from './github-client.js';
import { ConfluenceClient } from './confluence-client.js';

// ==================== INTERFACES ====================

interface SprintHealthMetrics {
  sprintName: string;
  sprintId: number;
  healthScore: number; // 0-100
  healthStatus: 'excellent' | 'good' | 'at-risk' | 'critical';
  metrics: {
    completionRate: number;
    velocityTrend: 'up' | 'stable' | 'down';
    scopeChange: number;
    blockedIssues: number;
    avgCycleTime: number;
    burndownHealth: 'on-track' | 'ahead' | 'behind';
  };
  risks: string[];
  recommendations: string[];
  issueBreakdown: {
    total: number;
    done: number;
    inProgress: number;
    todo: number;
    blocked: number;
  };
}

interface WorkloadMetrics {
  teamMember: string;
  userId: string;
  metrics: {
    assignedIssues: number;
    inProgressIssues: number;
    completedThisWeek: number;
    storyPointsAssigned: number;
    storyPointsCompleted: number;
    overdueTasks: number;
    avgCompletionTime: number;
  };
  workloadStatus: 'underutilized' | 'optimal' | 'heavy' | 'overloaded';
  riskFactors: string[];
}

interface TeamWorkloadDashboard {
  generatedAt: string;
  sprintName?: string;
  teamSize: number;
  totalIssues: number;
  averageWorkload: number;
  workloadDistribution: WorkloadMetrics[];
  balanceScore: number; // 0-100, how evenly distributed is work
  recommendations: string[];
  bottlenecks: string[];
}

interface SmartIssueAnalysis {
  suggestedType: string;
  suggestedPriority: string;
  suggestedLabels: string[];
  suggestedComponents: string[];
  estimatedStoryPoints: number;
  similarIssues: Array<{ key: string; summary: string; similarity: number }>;
  suggestions: string[];
}

interface ReleaseNotes {
  version: string;
  releaseDate: string;
  summary: string;
  highlights: string[];
  categories: {
    features: Array<{ key: string; summary: string; description?: string }>;
    improvements: Array<{ key: string; summary: string; description?: string }>;
    bugFixes: Array<{ key: string; summary: string; description?: string }>;
    breakingChanges: Array<{ key: string; summary: string; description?: string }>;
    deprecated: Array<{ key: string; summary: string; description?: string }>;
  };
  contributors: string[];
  stats: {
    totalIssues: number;
    totalPRs: number;
    totalCommits: number;
    filesChanged: number;
  };
  markdownContent: string;
  confluenceContent: string;
}

interface WorklogSummary {
  issueKey: string;
  issueSummary: string;
  totalTimeSpent: number; // in seconds
  totalTimeSpentFormatted: string;
  worklogs: Array<{
    author: string;
    timeSpent: string;
    timeSpentSeconds: number;
    started: string;
    comment?: string;
  }>;
  timeEstimate?: number;
  remainingEstimate?: number;
  progress: number; // percentage
}

// ==================== AI ANALYTICS CLASS ====================

export class AIAnalytics {
  private jiraClient: JiraClient;
  private githubClient: GitHubClient | null;
  private confluenceClient: ConfluenceClient | null;

  constructor(
    jiraClient: JiraClient,
    githubClient: GitHubClient | null = null,
    confluenceClient: ConfluenceClient | null = null
  ) {
    this.jiraClient = jiraClient;
    this.githubClient = githubClient;
    this.confluenceClient = confluenceClient;
  }

  // ==================== SPRINT HEALTH ANALYZER ====================

  /**
   * Analyze sprint health with comprehensive metrics
   */
  async analyzeSprintHealth(sprintId: number, boardId?: number): Promise<SprintHealthMetrics> {
    // Get sprint issues
    const sprintResult = await this.jiraClient.getSprintIssues(sprintId);
    const issues = sprintResult.issues;

    // Get sprint details if boardId provided
    let sprintName = `Sprint ${sprintId}`;
    if (boardId) {
      try {
        const sprints = await this.jiraClient.getSprints(boardId);
        const sprint = sprints.values.find(s => s.id === sprintId);
        if (sprint) {
          sprintName = sprint.name;
        }
      } catch {
        // Continue with default name
      }
    }

    // Calculate issue breakdown
    const issueBreakdown = {
      total: issues.length,
      done: 0,
      inProgress: 0,
      todo: 0,
      blocked: 0,
    };

    const blockedIssues: string[] = [];
    const risks: string[] = [];

    for (const issue of issues) {
      const status = issue.fields.status.name.toLowerCase();
      
      if (status === 'done' || status === 'closed' || status === 'resolved') {
        issueBreakdown.done++;
      } else if (status === 'in progress' || status === 'in review' || status === 'code review') {
        issueBreakdown.inProgress++;
      } else if (status === 'blocked' || status === 'impediment') {
        issueBreakdown.blocked++;
        blockedIssues.push(`${issue.key}: ${issue.fields.summary}`);
      } else {
        issueBreakdown.todo++;
      }

      // Check for unassigned issues
      if (!issue.fields.assignee && status !== 'done') {
        risks.push(`Unassigned issue: ${issue.key}`);
      }

      // Check for issues without priority
      if (!issue.fields.priority && status !== 'done') {
        risks.push(`No priority set: ${issue.key}`);
      }
    }

    // Calculate metrics
    const completionRate = issueBreakdown.total > 0 
      ? Math.round((issueBreakdown.done / issueBreakdown.total) * 100) 
      : 0;

    // Calculate health score
    let healthScore = 100;
    
    // Deduct for incomplete work
    healthScore -= Math.max(0, 50 - completionRate);
    
    // Deduct for blocked issues
    healthScore -= issueBreakdown.blocked * 5;
    
    // Deduct for too many in-progress items (WIP overload)
    if (issueBreakdown.inProgress > issues.length * 0.4) {
      healthScore -= 10;
      risks.push('Too many issues in progress (WIP overload)');
    }

    // Deduct for unbalanced work
    if (issueBreakdown.todo > issueBreakdown.done && completionRate < 50) {
      healthScore -= 10;
      risks.push('More work remaining than completed');
    }

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine health status
    let healthStatus: 'excellent' | 'good' | 'at-risk' | 'critical';
    if (healthScore >= 80) healthStatus = 'excellent';
    else if (healthScore >= 60) healthStatus = 'good';
    else if (healthScore >= 40) healthStatus = 'at-risk';
    else healthStatus = 'critical';

    // Determine burndown health
    let burndownHealth: 'on-track' | 'ahead' | 'behind' = 'on-track';
    if (completionRate > 70) burndownHealth = 'ahead';
    else if (completionRate < 30 && issueBreakdown.inProgress < 3) burndownHealth = 'behind';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (issueBreakdown.blocked > 0) {
      recommendations.push(`Address ${issueBreakdown.blocked} blocked issue(s) immediately`);
    }
    
    if (issueBreakdown.inProgress > issueBreakdown.total * 0.4) {
      recommendations.push('Focus on completing in-progress work before starting new items');
    }
    
    if (risks.filter(r => r.includes('Unassigned')).length > 0) {
      recommendations.push('Assign owners to all remaining issues');
    }
    
    if (completionRate < 50 && issueBreakdown.todo > 5) {
      recommendations.push('Consider reducing sprint scope');
    }

    if (healthStatus === 'excellent' && recommendations.length === 0) {
      recommendations.push('Sprint is progressing well - maintain current pace');
    }

    return {
      sprintName,
      sprintId,
      healthScore,
      healthStatus,
      metrics: {
        completionRate,
        velocityTrend: 'stable', // Would need historical data for actual trend
        scopeChange: 0, // Would need sprint history
        blockedIssues: issueBreakdown.blocked,
        avgCycleTime: 0, // Would need issue history
        burndownHealth,
      },
      risks,
      recommendations,
      issueBreakdown,
    };
  }

  // ==================== TEAM WORKLOAD DASHBOARD ====================

  /**
   * Generate team workload dashboard
   */
  async generateWorkloadDashboard(
    projectKey?: string,
    sprintId?: number
  ): Promise<TeamWorkloadDashboard> {
    let jql = 'assignee is not EMPTY';
    
    if (projectKey) {
      jql += ` AND project = "${projectKey}"`;
    }
    
    if (sprintId) {
      jql += ` AND sprint = ${sprintId}`;
    } else {
      // Default to open issues
      jql += ' AND status != Done AND status != Closed';
    }

    const result = await this.jiraClient.searchIssues(jql, 200);
    const issues = result.issues;

    // Group issues by assignee
    const assigneeMap = new Map<string, typeof issues>();
    
    for (const issue of issues) {
      const assignee = issue.fields.assignee;
      if (assignee) {
        const key = assignee.displayName;
        if (!assigneeMap.has(key)) {
          assigneeMap.set(key, []);
        }
        assigneeMap.get(key)!.push(issue);
      }
    }

    // Calculate workload metrics for each team member
    const workloadDistribution: WorkloadMetrics[] = [];
    const workloads: number[] = [];

    for (const [displayName, memberIssues] of assigneeMap) {
      const metrics = {
        assignedIssues: memberIssues.length,
        inProgressIssues: 0,
        completedThisWeek: 0,
        storyPointsAssigned: 0,
        storyPointsCompleted: 0,
        overdueTasks: 0,
        avgCompletionTime: 0,
      };

      const riskFactors: string[] = [];

      for (const issue of memberIssues) {
        const status = issue.fields.status.name.toLowerCase();
        
        if (status.includes('progress') || status.includes('review')) {
          metrics.inProgressIssues++;
        }

        // Check for overdue (simple heuristic based on update date)
        const updatedDate = new Date(issue.fields.updated);
        const daysSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceUpdate > 14 && !status.includes('done') && !status.includes('closed')) {
          metrics.overdueTasks++;
        }
      }

      // Determine workload status
      let workloadStatus: 'underutilized' | 'optimal' | 'heavy' | 'overloaded';
      
      if (metrics.assignedIssues <= 2) {
        workloadStatus = 'underutilized';
      } else if (metrics.assignedIssues <= 5) {
        workloadStatus = 'optimal';
      } else if (metrics.assignedIssues <= 8) {
        workloadStatus = 'heavy';
      } else {
        workloadStatus = 'overloaded';
        riskFactors.push(`Has ${metrics.assignedIssues} assigned issues`);
      }

      if (metrics.inProgressIssues > 3) {
        riskFactors.push('Too many items in progress simultaneously');
      }

      if (metrics.overdueTasks > 0) {
        riskFactors.push(`${metrics.overdueTasks} potentially stale issue(s)`);
      }

      workloadDistribution.push({
        teamMember: displayName,
        userId: '', // Would need to track this
        metrics,
        workloadStatus,
        riskFactors,
      });

      workloads.push(metrics.assignedIssues);
    }

    // Calculate balance score
    const avgWorkload = workloads.length > 0 
      ? workloads.reduce((a, b) => a + b, 0) / workloads.length 
      : 0;
    
    const variance = workloads.length > 0
      ? workloads.reduce((sum, w) => sum + Math.pow(w - avgWorkload, 2), 0) / workloads.length
      : 0;
    
    const stdDev = Math.sqrt(variance);
    const balanceScore = Math.max(0, Math.min(100, 100 - (stdDev * 10)));

    // Generate recommendations
    const recommendations: string[] = [];
    const bottlenecks: string[] = [];

    const overloaded = workloadDistribution.filter(w => w.workloadStatus === 'overloaded');
    const underutilized = workloadDistribution.filter(w => w.workloadStatus === 'underutilized');

    if (overloaded.length > 0 && underutilized.length > 0) {
      recommendations.push(
        `Redistribute work from ${overloaded.map(w => w.teamMember).join(', ')} to ${underutilized.map(w => w.teamMember).join(', ')}`
      );
    }

    if (overloaded.length > 0) {
      bottlenecks.push(...overloaded.map(w => `${w.teamMember} is overloaded with ${w.metrics.assignedIssues} issues`));
    }

    const highWIP = workloadDistribution.filter(w => w.metrics.inProgressIssues > 3);
    if (highWIP.length > 0) {
      recommendations.push(
        `${highWIP.map(w => w.teamMember).join(', ')} should focus on completing current work before starting new items`
      );
    }

    if (balanceScore < 50) {
      recommendations.push('Team workload is uneven - consider more balanced task distribution');
    }

    return {
      generatedAt: new Date().toISOString(),
      sprintName: sprintId ? `Sprint ${sprintId}` : undefined,
      teamSize: assigneeMap.size,
      totalIssues: issues.length,
      averageWorkload: Math.round(avgWorkload * 10) / 10,
      workloadDistribution,
      balanceScore: Math.round(balanceScore),
      recommendations,
      bottlenecks,
    };
  }

  // ==================== SMART ISSUE CREATOR ====================

  /**
   * Analyze text and suggest issue properties using NLP-like heuristics
   */
  async analyzeIssueText(
    text: string,
    projectKey: string
  ): Promise<SmartIssueAnalysis> {
    const textLower = text.toLowerCase();
    
    // Determine issue type based on keywords
    let suggestedType = 'Task';
    
    const bugKeywords = ['bug', 'error', 'crash', 'fail', 'broken', 'not working', 'issue', 'problem', 'fix'];
    const featureKeywords = ['feature', 'add', 'new', 'implement', 'create', 'develop', 'build'];
    const storyKeywords = ['as a user', 'as an admin', 'i want', 'so that', 'user story'];
    const epicKeywords = ['epic', 'initiative', 'large', 'multiple sprints'];
    const improvementKeywords = ['improve', 'enhance', 'optimize', 'refactor', 'performance'];

    if (epicKeywords.some(k => textLower.includes(k))) {
      suggestedType = 'Epic';
    } else if (storyKeywords.some(k => textLower.includes(k))) {
      suggestedType = 'Story';
    } else if (bugKeywords.some(k => textLower.includes(k))) {
      suggestedType = 'Bug';
    } else if (featureKeywords.some(k => textLower.includes(k))) {
      suggestedType = 'Story';
    } else if (improvementKeywords.some(k => textLower.includes(k))) {
      suggestedType = 'Improvement';
    }

    // Determine priority based on keywords
    let suggestedPriority = 'Medium';
    
    const urgentKeywords = ['urgent', 'critical', 'blocker', 'asap', 'emergency', 'production down'];
    const highKeywords = ['high priority', 'important', 'severe', 'major'];
    const lowKeywords = ['low priority', 'minor', 'nice to have', 'when possible'];

    if (urgentKeywords.some(k => textLower.includes(k))) {
      suggestedPriority = 'Critical';
    } else if (highKeywords.some(k => textLower.includes(k))) {
      suggestedPriority = 'High';
    } else if (lowKeywords.some(k => textLower.includes(k))) {
      suggestedPriority = 'Low';
    }

    // Extract potential labels
    const suggestedLabels: string[] = [];
    
    const labelPatterns: Record<string, string[]> = {
      'frontend': ['ui', 'frontend', 'css', 'react', 'vue', 'angular', 'html', 'button', 'page', 'component'],
      'backend': ['api', 'backend', 'server', 'database', 'endpoint', 'service'],
      'infrastructure': ['deploy', 'ci', 'cd', 'pipeline', 'docker', 'kubernetes', 'aws', 'cloud'],
      'security': ['security', 'auth', 'permission', 'vulnerability', 'ssl', 'encryption'],
      'performance': ['performance', 'slow', 'optimize', 'speed', 'memory', 'cpu'],
      'documentation': ['doc', 'readme', 'guide', 'tutorial'],
      'testing': ['test', 'qa', 'automation', 'e2e', 'unit test'],
    };

    for (const [label, keywords] of Object.entries(labelPatterns)) {
      if (keywords.some(k => textLower.includes(k))) {
        suggestedLabels.push(label);
      }
    }

    // Estimate story points based on complexity indicators
    let estimatedStoryPoints = 3; // Default medium
    
    const simpleIndicators = ['simple', 'easy', 'quick', 'small', 'typo', 'config change'];
    const complexIndicators = ['complex', 'large', 'multiple', 'refactor', 'architecture', 'rewrite'];
    const hugeIndicators = ['entire', 'complete overhaul', 'from scratch', 'migration'];

    if (hugeIndicators.some(k => textLower.includes(k))) {
      estimatedStoryPoints = 13;
    } else if (complexIndicators.some(k => textLower.includes(k))) {
      estimatedStoryPoints = 8;
    } else if (simpleIndicators.some(k => textLower.includes(k))) {
      estimatedStoryPoints = 1;
    }

    // Search for similar issues
    const similarIssues: Array<{ key: string; summary: string; similarity: number }> = [];
    
    try {
      // Extract key terms for search
      const words = text.split(/\s+/).filter(w => w.length > 4);
      const searchTerms = words.slice(0, 3).join(' OR ');
      
      if (searchTerms) {
        const searchResult = await this.jiraClient.searchIssues(
          `project = "${projectKey}" AND text ~ "${searchTerms}" ORDER BY updated DESC`,
          5
        );
        
        for (const issue of searchResult.issues) {
          similarIssues.push({
            key: issue.key,
            summary: issue.fields.summary,
            similarity: 0.7, // Simplified similarity score
          });
        }
      }
    } catch {
      // Search may fail, continue without similar issues
    }

    // Generate suggestions
    const suggestions: string[] = [];
    
    if (text.length < 50) {
      suggestions.push('Consider adding more detail to the description');
    }
    
    if (suggestedType === 'Bug' && !textLower.includes('reproduce')) {
      suggestions.push('Add steps to reproduce the bug');
    }
    
    if (suggestedType === 'Story' && !textLower.includes('acceptance')) {
      suggestions.push('Consider adding acceptance criteria');
    }
    
    if (similarIssues.length > 0) {
      suggestions.push(`Found ${similarIssues.length} potentially related issue(s) - check for duplicates`);
    }

    return {
      suggestedType,
      suggestedPriority,
      suggestedLabels,
      suggestedComponents: [], // Would need project components to suggest
      estimatedStoryPoints,
      similarIssues,
      suggestions,
    };
  }

  /**
   * Create issue from natural language with smart defaults
   */
  async createSmartIssue(
    text: string,
    projectKey: string,
    overrides: {
      type?: string;
      priority?: string;
      labels?: string[];
      assignee?: string;
    } = {}
  ): Promise<{ key: string; analysis: SmartIssueAnalysis }> {
    const analysis = await this.analyzeIssueText(text, projectKey);
    
    // Extract summary (first sentence or first 100 chars)
    const firstSentence = text.split(/[.!?]/)[0];
    const summary = firstSentence.length > 100 
      ? firstSentence.substring(0, 97) + '...'
      : firstSentence;

    const issue = await this.jiraClient.createIssue({
      projectKey,
      summary,
      description: text,
      issueType: overrides.type || analysis.suggestedType,
      priority: overrides.priority || analysis.suggestedPriority,
      labels: overrides.labels || analysis.suggestedLabels,
      assigneeId: overrides.assignee,
    });

    return {
      key: issue.key,
      analysis,
    };
  }

  // ==================== RELEASE NOTES GENERATOR ====================

  /**
   * Generate comprehensive release notes
   */
  async generateReleaseNotes(options: {
    projectKey: string;
    version: string;
    startDate?: string;
    endDate?: string;
    jqlFilter?: string;
    includeGitHub?: { owner: string; repo: string; baseBranch?: string; headBranch?: string };
  }): Promise<ReleaseNotes> {
    const endDate = options.endDate || new Date().toISOString().split('T')[0];
    const startDate = options.startDate || 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days ago

    // Build JQL query
    let jql = options.jqlFilter || 
      `project = "${options.projectKey}" AND status IN (Done, Closed, Resolved) AND resolved >= "${startDate}" AND resolved <= "${endDate}"`;

    const result = await this.jiraClient.searchIssues(jql, 200);
    const issues = result.issues;

    // Categorize issues
    const categories = {
      features: [] as Array<{ key: string; summary: string; description?: string }>,
      improvements: [] as Array<{ key: string; summary: string; description?: string }>,
      bugFixes: [] as Array<{ key: string; summary: string; description?: string }>,
      breakingChanges: [] as Array<{ key: string; summary: string; description?: string }>,
      deprecated: [] as Array<{ key: string; summary: string; description?: string }>,
    };

    const contributors = new Set<string>();

    for (const issue of issues) {
      const type = issue.fields.issuetype.name.toLowerCase();
      const labels = issue.fields.labels?.map(l => l.toLowerCase()) || [];
      
      const item = {
        key: issue.key,
        summary: issue.fields.summary,
        description: typeof issue.fields.description === 'string' 
          ? issue.fields.description.substring(0, 200) 
          : undefined,
      };

      // Track contributors
      if (issue.fields.assignee) {
        contributors.add(issue.fields.assignee.displayName);
      }
      if (issue.fields.reporter) {
        contributors.add(issue.fields.reporter.displayName);
      }

      // Categorize
      if (labels.includes('breaking-change') || labels.includes('breaking')) {
        categories.breakingChanges.push(item);
      } else if (labels.includes('deprecated')) {
        categories.deprecated.push(item);
      } else if (type === 'bug' || type === 'defect') {
        categories.bugFixes.push(item);
      } else if (type === 'story' || type === 'feature' || type === 'new feature') {
        categories.features.push(item);
      } else {
        categories.improvements.push(item);
      }
    }

    // Get GitHub stats if configured
    let gitStats = { totalPRs: 0, totalCommits: 0, filesChanged: 0 };
    
    if (this.githubClient && options.includeGitHub) {
      try {
        const { owner, repo, baseBranch, headBranch } = options.includeGitHub;
        const base = baseBranch || 'main';
        const head = headBranch || 'develop';
        
        const comparison = await this.githubClient.compareCommits(owner, repo, base, head);
        gitStats.totalCommits = comparison.total_commits;
        gitStats.filesChanged = comparison.files.length;
        
        const prs = await this.githubClient.getPullRequests(owner, repo, 'closed');
        const recentPRs = prs.filter(pr => {
          if (!pr.merged_at) return false;
          const mergedDate = new Date(pr.merged_at);
          return mergedDate >= new Date(startDate) && mergedDate <= new Date(endDate);
        });
        gitStats.totalPRs = recentPRs.length;
      } catch {
        // GitHub integration optional
      }
    }

    // Generate highlights
    const highlights: string[] = [];
    
    if (categories.features.length > 0) {
      highlights.push(`${categories.features.length} new feature(s) added`);
      // Add top feature as highlight
      highlights.push(`✨ ${categories.features[0].summary}`);
    }
    
    if (categories.bugFixes.length > 0) {
      highlights.push(`${categories.bugFixes.length} bug(s) fixed`);
    }
    
    if (categories.breakingChanges.length > 0) {
      highlights.push(`⚠️ ${categories.breakingChanges.length} breaking change(s) - review before upgrading`);
    }

    // Generate summary
    const summary = `Release ${options.version} includes ${issues.length} changes: ` +
      `${categories.features.length} new features, ${categories.improvements.length} improvements, ` +
      `and ${categories.bugFixes.length} bug fixes.`;

    // Generate Markdown content
    const markdownContent = this.generateMarkdownReleaseNotes(options.version, endDate, summary, highlights, categories, contributors, gitStats);

    // Generate Confluence content
    const confluenceContent = ConfluenceClient.markdownToStorageFormat(markdownContent);

    return {
      version: options.version,
      releaseDate: endDate,
      summary,
      highlights,
      categories,
      contributors: Array.from(contributors),
      stats: {
        totalIssues: issues.length,
        ...gitStats,
      },
      markdownContent,
      confluenceContent,
    };
  }

  private generateMarkdownReleaseNotes(
    version: string,
    releaseDate: string,
    summary: string,
    highlights: string[],
    categories: ReleaseNotes['categories'],
    contributors: Set<string>,
    gitStats: { totalPRs: number; totalCommits: number; filesChanged: number }
  ): string {
    let md = `# Release Notes - v${version}\n\n`;
    md += `**Release Date:** ${releaseDate}\n\n`;
    md += `## Summary\n\n${summary}\n\n`;

    if (highlights.length > 0) {
      md += `## Highlights\n\n`;
      for (const highlight of highlights) {
        md += `- ${highlight}\n`;
      }
      md += '\n';
    }

    if (categories.breakingChanges.length > 0) {
      md += `## ⚠️ Breaking Changes\n\n`;
      for (const item of categories.breakingChanges) {
        md += `- **${item.key}**: ${item.summary}\n`;
      }
      md += '\n';
    }

    if (categories.features.length > 0) {
      md += `## ✨ New Features\n\n`;
      for (const item of categories.features) {
        md += `- **${item.key}**: ${item.summary}\n`;
      }
      md += '\n';
    }

    if (categories.improvements.length > 0) {
      md += `## 🔧 Improvements\n\n`;
      for (const item of categories.improvements) {
        md += `- **${item.key}**: ${item.summary}\n`;
      }
      md += '\n';
    }

    if (categories.bugFixes.length > 0) {
      md += `## 🐛 Bug Fixes\n\n`;
      for (const item of categories.bugFixes) {
        md += `- **${item.key}**: ${item.summary}\n`;
      }
      md += '\n';
    }

    if (categories.deprecated.length > 0) {
      md += `## 📦 Deprecated\n\n`;
      for (const item of categories.deprecated) {
        md += `- **${item.key}**: ${item.summary}\n`;
      }
      md += '\n';
    }

    if (contributors.size > 0) {
      md += `## 👥 Contributors\n\n`;
      md += `Thanks to all contributors: ${Array.from(contributors).join(', ')}\n\n`;
    }

    if (gitStats.totalCommits > 0 || gitStats.totalPRs > 0) {
      md += `## 📊 Statistics\n\n`;
      md += `- ${gitStats.totalPRs} pull requests merged\n`;
      md += `- ${gitStats.totalCommits} commits\n`;
      md += `- ${gitStats.filesChanged} files changed\n`;
    }

    return md;
  }

  // ==================== TIME TRACKING (WORKLOGS) ====================

  /**
   * Get worklog summary for an issue
   */
  async getIssueWorklog(issueKey: string): Promise<WorklogSummary> {
    const issue = await this.jiraClient.getIssue(issueKey);
    
    // Get worklogs using the API
    interface WorklogResponse {
      worklogs: Array<{
        author: { displayName: string };
        timeSpent: string;
        timeSpentSeconds: number;
        started: string;
        comment?: string;
      }>;
    }

    const worklogUrl = `/issue/${issueKey}/worklog`;
    // We'll need to extend jira-client to support this, for now use direct approach
    
    // Calculate totals (simplified - would need actual worklog API call)
    const timeSpent = (issue.fields as unknown as { timespent?: number }).timespent || 0;
    const timeEstimate = (issue.fields as unknown as { timeoriginalestimate?: number }).timeoriginalestimate || 0;
    const remainingEstimate = (issue.fields as unknown as { timeestimate?: number }).timeestimate || 0;

    const progress = timeEstimate > 0 
      ? Math.min(100, Math.round((timeSpent / timeEstimate) * 100))
      : 0;

    return {
      issueKey,
      issueSummary: issue.fields.summary,
      totalTimeSpent: timeSpent,
      totalTimeSpentFormatted: this.formatTime(timeSpent),
      worklogs: [], // Would need worklog API call
      timeEstimate,
      remainingEstimate,
      progress,
    };
  }

  /**
   * Get worklog summary for multiple issues (sprint/project)
   */
  async getTeamWorklogs(options: {
    projectKey?: string;
    sprintId?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalTimeLogged: number;
    totalTimeLoggedFormatted: string;
    issueBreakdown: Array<{ key: string; summary: string; timeSpent: number; timeSpentFormatted: string }>;
    userBreakdown: Array<{ user: string; timeSpent: number; timeSpentFormatted: string }>;
  }> {
    let jql = 'timespent > 0';
    
    if (options.projectKey) {
      jql += ` AND project = "${options.projectKey}"`;
    }
    
    if (options.sprintId) {
      jql += ` AND sprint = ${options.sprintId}`;
    }

    if (options.startDate) {
      jql += ` AND worklogDate >= "${options.startDate}"`;
    }

    if (options.endDate) {
      jql += ` AND worklogDate <= "${options.endDate}"`;
    }

    const result = await this.jiraClient.searchIssues(jql, 100);
    const issues = result.issues;

    const issueBreakdown: Array<{ key: string; summary: string; timeSpent: number; timeSpentFormatted: string }> = [];
    const userTimeMap = new Map<string, number>();
    let totalTimeLogged = 0;

    for (const issue of issues) {
      const timeSpent = (issue.fields as unknown as { timespent?: number }).timespent || 0;
      
      issueBreakdown.push({
        key: issue.key,
        summary: issue.fields.summary,
        timeSpent,
        timeSpentFormatted: this.formatTime(timeSpent),
      });

      totalTimeLogged += timeSpent;

      // Track by assignee (simplified - would need actual worklog data for accuracy)
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      userTimeMap.set(assignee, (userTimeMap.get(assignee) || 0) + timeSpent);
    }

    const userBreakdown = Array.from(userTimeMap.entries())
      .map(([user, time]) => ({
        user,
        timeSpent: time,
        timeSpentFormatted: this.formatTime(time),
      }))
      .sort((a, b) => b.timeSpent - a.timeSpent);

    return {
      totalTimeLogged,
      totalTimeLoggedFormatted: this.formatTime(totalTimeLogged),
      issueBreakdown: issueBreakdown.sort((a, b) => b.timeSpent - a.timeSpent),
      userBreakdown,
    };
  }

  private formatTime(seconds: number): string {
    if (seconds === 0) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  }

  // ==================== CROSS-PLATFORM SYNC ====================

  /**
   * Create issues from GitHub PR or commit messages
   */
  async createIssuesFromGitHub(
    owner: string,
    repo: string,
    projectKey: string,
    options: {
      fromPRs?: boolean;
      fromCommits?: boolean;
      branch?: string;
      since?: string;
      labelFilter?: string;
    } = {}
  ): Promise<Array<{ source: string; jiraKey: string; title: string }>> {
    if (!this.githubClient) {
      throw new Error('GitHub client not configured');
    }

    const created: Array<{ source: string; jiraKey: string; title: string }> = [];

    if (options.fromPRs) {
      const prs = await this.githubClient.getPullRequests(owner, repo, 'open');
      
      for (const pr of prs) {
        // Skip if already linked (check for Jira key in title)
        if (pr.title.match(/[A-Z]+-\d+/)) continue;

        // Create Jira issue
        const analysis = await this.analyzeIssueText(pr.body || pr.title, projectKey);
        const issue = await this.jiraClient.createIssue({
          projectKey,
          summary: `[GitHub PR] ${pr.title}`,
          description: `GitHub Pull Request: ${pr.html_url}\n\n${pr.body || ''}`,
          issueType: analysis.suggestedType,
          labels: ['github-pr', ...analysis.suggestedLabels],
        });

        created.push({
          source: `PR #${pr.number}`,
          jiraKey: issue.key,
          title: pr.title,
        });
      }
    }

    if (options.fromCommits) {
      const commits = await this.githubClient.getCommits(owner, repo, {
        sha: options.branch,
        since: options.since,
        per_page: 50,
      });

      for (const commit of commits) {
        // Skip if already linked
        if (commit.commit.message.match(/[A-Z]+-\d+/)) continue;
        
        // Skip merge commits
        if (commit.commit.message.startsWith('Merge')) continue;

        const summary = commit.commit.message.split('\n')[0].substring(0, 100);
        
        const issue = await this.jiraClient.createIssue({
          projectKey,
          summary: `[GitHub Commit] ${summary}`,
          description: `GitHub Commit: ${commit.html_url}\n\nFull message:\n${commit.commit.message}`,
          issueType: 'Task',
          labels: ['github-commit'],
        });

        created.push({
          source: commit.sha.substring(0, 7),
          jiraKey: issue.key,
          title: summary,
        });
      }
    }

    return created;
  }

  /**
   * Publish release notes to Confluence
   */
  async publishReleaseNotesToConfluence(
    releaseNotes: ReleaseNotes,
    spaceKey: string,
    parentPageId?: string
  ): Promise<{ pageId: string; url: string }> {
    if (!this.confluenceClient) {
      throw new Error('Confluence client not configured');
    }

    const pageTitle = `Release Notes - v${releaseNotes.version} (${releaseNotes.releaseDate})`;

    const page = await this.confluenceClient.createPage({
      spaceKey,
      title: pageTitle,
      content: releaseNotes.confluenceContent,
      parentId: parentPageId,
    });

    // Add labels
    await this.confluenceClient.addPageLabels(page.id, [
      'release-notes',
      `version-${releaseNotes.version.replace(/\./g, '-')}`,
    ]);

    return {
      pageId: page.id,
      url: page._links.webui,
    };
  }
}

