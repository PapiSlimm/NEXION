import { Octokit } from "@octokit/rest";
import { config, integrations } from "../config.js";
import type { RepoHealth } from "../types.js";

// Real GitHub integration. With GITHUB_TOKEN set, this hits the live GitHub
// REST API (github.com or Enterprise via GITHUB_API_URL). Without it, returns
// clearly-labelled sample data so the platform still boots.
let octokit: Octokit | null = null;
function client(): Octokit {
  if (!octokit) {
    octokit = new Octokit({ auth: config.GITHUB_TOKEN, baseUrl: config.GITHUB_API_URL });
  }
  return octokit;
}

function sample(repo: string): RepoHealth {
  return {
    repo,
    defaultBranch: "main",
    openIssues: 12,
    openPullRequests: 3,
    lastCommitAt: "2026-07-22T18:40:00Z",
    lastRelease: "v1.4.2",
    ciStatus: "passing",
    ciConclusion: "success",
    stars: 128,
    source: "sample",
  };
}

/** owner/repo → live repository health, including latest CI conclusion. */
export async function getRepoHealth(fullName: string): Promise<RepoHealth> {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new Error(`Invalid repo "${fullName}", expected "owner/repo"`);
  if (!integrations.github) return sample(fullName);

  const gh = client();
  const { data: r } = await gh.repos.get({ owner, repo });

  const [prs, commits, releases, runs] = await Promise.all([
    gh.pulls.list({ owner, repo, state: "open", per_page: 1 }),
    gh.repos.listCommits({ owner, repo, per_page: 1 }),
    gh.repos.listReleases({ owner, repo, per_page: 1 }).catch(() => ({ data: [] as any[] })),
    gh.actions.listWorkflowRunsForRepo({ owner, repo, per_page: 1, branch: r.default_branch }).catch(() => ({ data: { workflow_runs: [] as any[] } })),
  ]);

  // open PR count comes from the Link header total when present; fall back to length
  const openPRs = (prs as any).headers?.link?.match(/page=(\d+)>; rel="last"/)?.[1];
  const latestRun = runs.data.workflow_runs[0];
  const ciConclusion = latestRun?.conclusion ?? null;
  const ciStatus = ciConclusion === "success" ? "passing" : ciConclusion ? "failing" : "unknown";

  return {
    repo: fullName,
    defaultBranch: r.default_branch,
    openIssues: r.open_issues_count,
    openPullRequests: openPRs ? Number(openPRs) : prs.data.length,
    lastCommitAt: commits.data[0]?.commit?.committer?.date ?? null,
    lastRelease: releases.data[0]?.tag_name ?? null,
    ciStatus,
    ciConclusion,
    stars: r.stargazers_count,
    source: "github",
  };
}
