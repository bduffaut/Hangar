// Names of Docker objects Hangar creates. Humans read these; code finds objects by label.

export function appContainerName(projectName: string, deploymentNumber: number): string {
  return `hangar-app-${projectName}-${deploymentNumber}`
}

/** The image repository holding every build of a project, e.g. `hangar/blog`. */
export function appImageRepository(projectName: string): string {
  return `hangar/${projectName}`
}

export function appImageRef(
  projectName: string,
  deploymentNumber: number,
  commitSha: string,
): string {
  return `${appImageRepository(projectName)}:${deploymentNumber}-${commitSha.slice(0, 7)}`
}
