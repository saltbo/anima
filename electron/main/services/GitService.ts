import simpleGit from 'simple-git'
import { createLogger } from '../logger'

const log = createLogger('git')

export class GitService {
  async createMilestoneBranch(projectPath: string, milestoneId: string): Promise<string> {
    const git = simpleGit(projectPath)
    const branchName = `milestone/${milestoneId}`
    try {
      const branches = await git.branchLocal()
      if (branches.all.includes(branchName)) {
        await git.checkout(branchName)
        log.info('checkout existing branch', { branch: branchName })
      } else {
        await git.checkoutLocalBranch(branchName)
        log.info('created branch', { branch: branchName })
      }
      const latest = await git.revparse(['HEAD'])
      return latest.trim()
    } catch (err) {
      log.error('createMilestoneBranch failed', { error: String(err) })
      throw err
    }
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    const git = simpleGit(projectPath)
    const status = await git.status()
    return status.current ?? ''
  }

  async checkoutBranch(projectPath: string, branchName: string): Promise<void> {
    const git = simpleGit(projectPath)
    await git.checkout(branchName)
  }

  async getCommitLog(projectPath: string, branch: string): Promise<string> {
    const git = simpleGit(projectPath)
    try {
      const result = await git.log(['--oneline', branch])
      return result.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`).join('\n')
    } catch {
      return ''
    }
  }

  async hasUncommittedChanges(projectPath: string): Promise<boolean> {
    const git = simpleGit(projectPath)
    const status = await git.status()
    return !status.isClean()
  }

  async isGitRepo(projectPath: string): Promise<boolean> {
    try {
      const git = simpleGit(projectPath)
      await git.revparse(['--git-dir'])
      return true
    } catch {
      return false
    }
  }

  async getDefaultBranch(projectPath: string): Promise<string> {
    const git = simpleGit(projectPath)
    const branches = await git.branchLocal()
    if (branches.all.includes('main')) return 'main'
    if (branches.all.includes('master')) return 'master'
    return branches.all[0] ?? 'main'
  }

  async squashMerge(projectPath: string, source: string, target: string, message: string): Promise<void> {
    const git = simpleGit(projectPath)
    await git.checkout(target)
    await git.raw(['merge', '--squash', source])
    await git.commit(message)
    log.info('squash merge completed', { source, target })
  }

  async deleteBranch(projectPath: string, branchName: string): Promise<void> {
    const git = simpleGit(projectPath)
    await git.deleteLocalBranch(branchName, true)
    log.info('deleted branch', { branch: branchName })
  }

  async resetBranchToCommit(projectPath: string, branch: string, commitHash: string): Promise<void> {
    const git = simpleGit(projectPath)
    await git.checkout(branch)
    await git.reset(['--hard', commitHash])
    log.info('reset branch to commit', { branch, commitHash })
  }

  async getCommitCountSince(projectPath: string, baseCommit: string): Promise<number> {
    const git = simpleGit(projectPath)
    try {
      const result = await git.raw(['rev-list', '--count', `${baseCommit}..HEAD`])
      return parseInt(result.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  async getDiffStats(projectPath: string, baseRef: string, headRef: string): Promise<{ filesChanged: number; insertions: number; deletions: number }> {
    const git = simpleGit(projectPath)
    try {
      const result = await git.raw(['diff', '--shortstat', `${baseRef}...${headRef}`])
      const files = result.match(/(\d+) files? changed/)
      const ins = result.match(/(\d+) insertions?/)
      const del = result.match(/(\d+) deletions?/)
      return {
        filesChanged: files ? parseInt(files[1], 10) : 0,
        insertions: ins ? parseInt(ins[1], 10) : 0,
        deletions: del ? parseInt(del[1], 10) : 0,
      }
    } catch {
      return { filesChanged: 0, insertions: 0, deletions: 0 }
    }
  }
}
