import type { DeploymentView } from '@hangar/shared'
import type { Deployment } from './repo.ts'

export function deploymentView(d: Deployment, currentDeploymentId: string | null): DeploymentView {
  return {
    id: d.id,
    projectId: d.projectId,
    number: d.number,
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    commitAuthor: d.commitAuthor,
    branch: d.branch,
    status: d.status,
    failureCode: d.failureCode,
    failureReason: d.failureReason,
    trigger: d.trigger,
    sourceDeploymentId: d.sourceDeploymentId,
    port: d.port,
    isCurrent: d.id === currentDeploymentId,
    createdAt: d.createdAt.toISOString(),
    startedAt: d.startedAt?.toISOString() ?? null,
    finishedAt: d.finishedAt?.toISOString() ?? null,
  }
}
