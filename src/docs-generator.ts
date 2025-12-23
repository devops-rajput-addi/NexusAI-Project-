/**
 * Documentation Generator
 * Alternative to Confluence for generating and storing documentation
 * Supports: Local files, GitHub repository, GitHub Wiki
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { GitHubClient } from './github-client.js';

export interface DocGeneratorConfig {
  outputDir?: string;  // Local directory for docs
  githubClient?: GitHubClient | null;
  githubOwner?: string;
  githubRepo?: string;
}

export interface GeneratedDoc {
  title: string;
  filename: string;
  content: string;
  format: 'markdown' | 'html';
}

export class DocsGenerator {
  private config: DocGeneratorConfig;

  constructor(config: DocGeneratorConfig = {}) {
    this.config = {
      outputDir: config.outputDir || './generated-docs',
      ...config,
    };
  }

  /**
   * Save document to local file system
   */
  async saveToLocal(doc: GeneratedDoc): Promise<string> {
    const outputDir = this.config.outputDir!;
    
    // Create directory if it doesn't exist
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const extension = doc.format === 'markdown' ? '.md' : '.html';
    const filename = doc.filename.endsWith(extension) ? doc.filename : `${doc.filename}${extension}`;
    const filepath = join(outputDir, filename);

    await writeFile(filepath, doc.content, 'utf-8');
    
    return filepath;
  }

  /**
   * Save document to GitHub repository
   */
  async saveToGitHub(
    doc: GeneratedDoc,
    options: {
      owner: string;
      repo: string;
      path?: string;
      branch?: string;
      commitMessage?: string;
    }
  ): Promise<{ url: string; sha: string }> {
    if (!this.config.githubClient) {
      throw new Error('GitHub client not configured');
    }

    const extension = doc.format === 'markdown' ? '.md' : '.html';
    const filename = doc.filename.endsWith(extension) ? doc.filename : `${doc.filename}${extension}`;
    const filePath = options.path ? `${options.path}/${filename}` : `docs/${filename}`;
    const commitMessage = options.commitMessage || `docs: Add ${doc.title}`;

    // Encode content to base64
    const contentBase64 = Buffer.from(doc.content, 'utf-8').toString('base64');

    // Check if file exists to get SHA for update
    let existingSha: string | undefined;
    try {
      const existing = await this.config.githubClient.getFileContent(
        options.owner,
        options.repo,
        filePath,
        options.branch
      );
      existingSha = existing.sha;
    } catch {
      // File doesn't exist, will create new
    }

    // Create or update file via GitHub API
    const url = `https://api.github.com/repos/${options.owner}/${options.repo}/contents/${filePath}`;
    
    const body: Record<string, unknown> = {
      message: commitMessage,
      content: contentBase64,
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    if (options.branch) {
      body.branch = options.branch;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to save to GitHub: ${error}`);
    }

    const result = await response.json() as { content: { html_url: string; sha: string } };
    
    return {
      url: result.content.html_url,
      sha: result.content.sha,
    };
  }

  /**
   * Generate Sprint Report document
   */
  generateSprintReport(data: {
    sprintName: string;
    sprintId: number;
    healthScore: number;
    healthStatus: string;
    completionRate: number;
    issueBreakdown: {
      total: number;
      done: number;
      inProgress: number;
      todo: number;
      blocked: number;
    };
    risks: string[];
    recommendations: string[];
    generatedAt?: string;
  }): GeneratedDoc {
    const date = data.generatedAt || new Date().toISOString().split('T')[0];
    
    const content = `# Sprint Report: ${data.sprintName}

**Generated:** ${date}  
**Sprint ID:** ${data.sprintId}

---

## 📊 Sprint Health

| Metric | Value |
|--------|-------|
| **Health Score** | ${data.healthScore}/100 |
| **Status** | ${data.healthStatus.toUpperCase()} |
| **Completion Rate** | ${data.completionRate}% |

---

## 📈 Issue Breakdown

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Done | ${data.issueBreakdown.done} | ${Math.round((data.issueBreakdown.done / data.issueBreakdown.total) * 100)}% |
| 🔄 In Progress | ${data.issueBreakdown.inProgress} | ${Math.round((data.issueBreakdown.inProgress / data.issueBreakdown.total) * 100)}% |
| 📋 To Do | ${data.issueBreakdown.todo} | ${Math.round((data.issueBreakdown.todo / data.issueBreakdown.total) * 100)}% |
| 🚫 Blocked | ${data.issueBreakdown.blocked} | ${Math.round((data.issueBreakdown.blocked / data.issueBreakdown.total) * 100)}% |
| **Total** | **${data.issueBreakdown.total}** | 100% |

---

## ⚠️ Risks

${data.risks.length > 0 ? data.risks.map(r => `- ${r}`).join('\n') : '_No risks identified_'}

---

## 💡 Recommendations

${data.recommendations.map(r => `- ${r}`).join('\n')}

---

_This report was auto-generated by DevOps MCP Hub_
`;

    return {
      title: `Sprint Report - ${data.sprintName}`,
      filename: `sprint-report-${data.sprintId}-${date}`,
      content,
      format: 'markdown',
    };
  }

  /**
   * Generate Team Workload Report
   */
  generateWorkloadReport(data: {
    generatedAt: string;
    teamSize: number;
    totalIssues: number;
    averageWorkload: number;
    balanceScore: number;
    workloadDistribution: Array<{
      teamMember: string;
      metrics: {
        assignedIssues: number;
        inProgressIssues: number;
      };
      workloadStatus: string;
      riskFactors: string[];
    }>;
    bottlenecks: string[];
    recommendations: string[];
  }): GeneratedDoc {
    const date = data.generatedAt.split('T')[0];
    
    const statusEmoji: Record<string, string> = {
      underutilized: '🔵',
      optimal: '🟢',
      heavy: '🟡',
      overloaded: '🔴',
    };

    const memberRows = data.workloadDistribution.map(m => 
      `| ${statusEmoji[m.workloadStatus] || '⚪'} ${m.teamMember} | ${m.metrics.assignedIssues} | ${m.metrics.inProgressIssues} | ${m.workloadStatus} |`
    ).join('\n');

    const content = `# Team Workload Report

**Generated:** ${date}  
**Team Size:** ${data.teamSize}  
**Total Issues:** ${data.totalIssues}  
**Balance Score:** ${data.balanceScore}/100

---

## 👥 Individual Workload

| Team Member | Assigned | In Progress | Status |
|-------------|----------|-------------|--------|
${memberRows}

---

## 🚧 Bottlenecks

${data.bottlenecks.length > 0 ? data.bottlenecks.map(b => `- ${b}`).join('\n') : '_No bottlenecks identified_'}

---

## 💡 Recommendations

${data.recommendations.map(r => `- ${r}`).join('\n')}

---

_This report was auto-generated by DevOps MCP Hub_
`;

    return {
      title: `Team Workload Report - ${date}`,
      filename: `workload-report-${date}`,
      content,
      format: 'markdown',
    };
  }

  /**
   * Generate a simple documentation page
   */
  generateDocPage(
    title: string,
    content: string,
    metadata: {
      author?: string;
      tags?: string[];
      project?: string;
    } = {}
  ): GeneratedDoc {
    const date = new Date().toISOString().split('T')[0];
    
    const frontmatter = `---
title: ${title}
date: ${date}
${metadata.author ? `author: ${metadata.author}` : ''}
${metadata.project ? `project: ${metadata.project}` : ''}
${metadata.tags ? `tags: [${metadata.tags.join(', ')}]` : ''}
---

`;

    const fullContent = frontmatter + content + `

---

_Generated by DevOps MCP Hub on ${date}_
`;

    // Create safe filename
    const safeFilename = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      title,
      filename: `${safeFilename}-${date}`,
      content: fullContent,
      format: 'markdown',
    };
  }
}

/**
 * Create DocsGenerator from environment
 */
export function createDocsGeneratorFromEnv(githubClient: GitHubClient | null): DocsGenerator {
  const outputDir = process.env.DOCS_OUTPUT_DIR || './generated-docs';
  const githubOwner = process.env.DOCS_GITHUB_OWNER;
  const githubRepo = process.env.DOCS_GITHUB_REPO;

  return new DocsGenerator({
    outputDir,
    githubClient,
    githubOwner,
    githubRepo,
  });
}

