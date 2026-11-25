// Names of Docker objects Hangar creates. Humans read these; code finds objects by label.

export function appContainerName(projectName: string, deploymentNumber: number): string {
  return `hangar-app-${projectName}-${deploymentNumber}`
}

/**
 * The name other apps of the same account reach an app by, on their shared network: its own
 * name, so Zigbee2MQTT finds `mosquitto`. None for names starting with `hangar-`: Traefik and
 * core share that network, and an app called `hangar-core` must not answer for core.
 */
export function appAlias(projectName: string): string | null {
  return projectName.startsWith('hangar-') || projectName === 'hangar' ? null : projectName
}

/** The Docker network holding every app of one account. */
export function ownerNetworkName(ownerId: string): string {
  return `hangar-apps-${ownerId}`
}

/** The private network of one stack (D44): the app and its services, nothing else. */
export function stackNetworkName(projectId: string): string {
  return `hangar-stack-${projectId}`
}

/** A stack service's container, e.g. `hangar-svc-photos-database`. */
export function serviceContainerName(projectName: string, service: string): string {
  return `hangar-svc-${projectName}-${service}`
}

/** The BuildKit builder of one account. */
export function ownerBuilderName(ownerId: string): string {
  return `hangar-builder-${ownerId}`
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
