import simpleGit from 'simple-git'
import { createLogger } from '../logger'

const log = createLogger('git')

export async function createMilestoneBranch(projectPath: string, milestoneId: string): Promise<string> {
  const git = simpleGit(projectPath)
  const branchName = `milestone/${milestoneId}`
  try {
    // Check if branch already exists
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

export async function getCurrentBranch(projectPath: string): Promise<string> {
  const git = simpleGit(projectPath)
  const status = await git.status()
  return status.current ?? ''
}

export async function checkoutBranch(projectPath: string, branchName: string): Promise<void> {
  const git = simpleGit(projectPath)
  await git.checkout(branchName)
}

export async function getCommitLog(projectPath: string, branch: string): Promise<string> {
  const git = simpleGit(projectPath)
  try {
    const log = await git.log(['--oneline', branch])
    return log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`).join('\n')
  } catch {
    return ''
  }
}

export async function hasUncommittedChanges(projectPath: string): Promise<boolean> {
  const git = simpleGit(projectPath)
  const status = await git.status()
  return !status.isClean()
}

export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    const git = simpleGit(projectPath)
    await git.revparse(['--git-dir'])
    return true
  } catch {
    return false
  }
}
