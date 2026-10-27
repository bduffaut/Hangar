// Names of Docker objects Hangar creates. Humans read these; code finds objects by label.

export function appContainerName(projectName: string, deploymentNumber: number): string {
  return `hangar-app-${projectName}-${deploymentNumber}`
}

export function appImageRef(
  projectName: string,
  deploymentNumber: number,
  commitSha: string,
): string {
  return `hangar/${projectName}:${deploymentNumber}-${commitSha.slice(0, 7)}`
}
