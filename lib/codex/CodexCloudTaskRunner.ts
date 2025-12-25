/**
 * CodexCloudTaskRunner - Production implementation stub
 *
 * This is a placeholder for the real Codex Cloud SDK integration.
 * When ready, this would:
 * 1. Authenticate with OpenAI Codex API
 * 2. Submit tasks to Codex Cloud for execution
 * 3. Poll for completion or use webhooks
 * 4. Integrate with GitHub for real PR creation
 *
 * TODO: Implement when Codex SDK is available
 */

import type { TaskRunner, StartTaskArgs } from "./TaskRunner"
import type { CodexTask, WorkspaceSnapshot } from "./types"

/**
 * CodexCloudTaskRunner - NOT IMPLEMENTED
 *
 * This stub shows where the real Codex Cloud integration would plug in.
 * For now, use MockTaskRunner instead.
 */
export class CodexCloudTaskRunner implements TaskRunner {
  /**
   * Start a task using Codex Cloud
   *
   * Production implementation would:
   * 1. Authenticate with Codex API using CODEX_API_KEY
   * 2. Submit the prompt + workspace context to Codex Cloud
   * 3. Return a task ID for polling
   *
   * @see https://platform.openai.com/docs/api-reference/codex (future)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async startTask(args: StartTaskArgs): Promise<CodexTask> {
    // TODO: Implement Codex Cloud integration
    //
    // Example pseudocode:
    // const codex = new CodexClient({ apiKey: process.env.CODEX_API_KEY });
    // const job = await codex.tasks.create({
    //   prompt: args.prompt,
    //   workspaceFiles: args.workspace.files,
    //   model: process.env.CODEX_MODEL || "codex-3",
    // });
    // return this.pollForCompletion(job.id);

    throw new Error(
      "CodexCloudTaskRunner not implemented. Use MockTaskRunner for demo."
    )
  }

  /**
   * Apply changes from Codex Cloud to the workspace
   *
   * Production implementation would:
   * 1. Fetch the completed task from Codex Cloud
   * 2. Download generated file changes
   * 3. Apply to workspace (or real filesystem)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async applyChanges(taskId: string, demoUid: string): Promise<WorkspaceSnapshot> {
    // TODO: Implement
    //
    // Example pseudocode:
    // const codex = new CodexClient({ apiKey: process.env.CODEX_API_KEY });
    // const task = await codex.tasks.get(taskId);
    // for (const change of task.changes) {
    //   await fs.writeFile(change.path, change.content);
    // }
    // return updatedWorkspace;

    throw new Error(
      "CodexCloudTaskRunner not implemented. Use MockTaskRunner for demo."
    )
  }

  /**
   * Create a PR using GitHub integration
   *
   * Production implementation would:
   * 1. Use GitHub OAuth token from user
   * 2. Create a branch with the changes
   * 3. Open a PR via GitHub API
   * 4. Return the real PR URL
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createPR(taskId: string, demoUid: string): Promise<{ prUrl: string }> {
    // TODO: Implement GitHub integration
    //
    // Example pseudocode:
    // const octokit = new Octokit({ auth: user.githubToken });
    // const branch = await octokit.git.createRef({
    //   owner, repo, ref: `refs/heads/codex-${taskId}`, sha: baseSha
    // });
    // for (const change of task.changes) {
    //   await octokit.repos.createOrUpdateFileContents({...});
    // }
    // const pr = await octokit.pulls.create({
    //   owner, repo, head: branch, base: 'main', title: task.title
    // });
    // return { prUrl: pr.html_url };

    throw new Error(
      "CodexCloudTaskRunner not implemented. Use MockTaskRunner for demo."
    )
  }

  /**
   * Get a task from Codex Cloud
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getTask(taskId: string, demoUid: string): Promise<CodexTask | null> {
    // TODO: Implement
    //
    // Example pseudocode:
    // const codex = new CodexClient({ apiKey: process.env.CODEX_API_KEY });
    // return await codex.tasks.get(taskId);

    throw new Error(
      "CodexCloudTaskRunner not implemented. Use MockTaskRunner for demo."
    )
  }
}

/**
 * Environment variables needed for production:
 *
 * CODEX_API_KEY - API key for Codex Cloud
 * CODEX_MODEL - Model to use (e.g., "codex-3")
 * GITHUB_CLIENT_ID - GitHub OAuth app client ID
 * GITHUB_CLIENT_SECRET - GitHub OAuth app client secret
 */
