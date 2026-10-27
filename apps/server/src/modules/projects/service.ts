import { checkProjectName } from '@hangar/shared'
import type { Ctx } from '../../context.ts'
import { insertProject, type NewProject, type Project, updateProject } from './repo.ts'

export class ProjectError extends Error {}

const MIN_MEMORY_LIMIT_MB = 64

export interface ProjectSettings {
  branch?: string
  rootDir?: string
  /** null means auto-detect. */
  port?: number | null
  memoryLimitMb?: number
}

function validate(settings: ProjectSettings): void {
  const { port, memoryLimitMb, rootDir } = settings
  if (rootDir && (rootDir.startsWith('/') || rootDir.split('/').includes('..'))) {
    throw new ProjectError('Root directory must be a path inside the repository')
  }
  if (port != null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new ProjectError(`Invalid port: ${port}`)
  }
  if (
    memoryLimitMb !== undefined &&
    (!Number.isInteger(memoryLimitMb) || memoryLimitMb < MIN_MEMORY_LIMIT_MB)
  ) {
    throw new ProjectError(`Memory limit must be at least ${MIN_MEMORY_LIMIT_MB} MB`)
  }
}

export async function createProject(
  ctx: Ctx,
  input: ProjectSettings & Pick<NewProject, 'name' | 'repoUrl' | 'triggerMode'>,
): Promise<Project> {
  const problem = checkProjectName(input.name)
  if (problem) throw new ProjectError(`Invalid project name "${input.name}": ${problem}`)
  validate(input)
  return insertProject(ctx.db, { ...input, branch: input.branch ?? 'main' })
}

/** Changes take effect on the next deploy. */
export async function updateProjectSettings(
  ctx: Ctx,
  project: Project,
  settings: ProjectSettings,
): Promise<void> {
  validate(settings)
  await updateProject(ctx.db, project.id, settings)
}
