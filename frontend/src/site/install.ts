/**
 * The one-line install, as the guides and front page show it. It downloads from the newest GitHub
 * release, never from this site, so the site serves nothing anyone runs (D41).
 */
export const INSTALL_SCRIPT_URL =
  'https://github.com/bduffaut/Hangar/releases/latest/download/install.sh'
export const INSTALL_COMMAND = `curl -fsSL ${INSTALL_SCRIPT_URL} | sudo bash`
