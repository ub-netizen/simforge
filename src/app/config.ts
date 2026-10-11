/**
 * Site-wide configuration.
 *
 * Set GITHUB_USERNAME once the public repository exists. Until then, GitHub
 * links are hidden rather than pointing at a guessed URL.
 */
export const GITHUB_USERNAME: string | null = 'ub-netizen';

export const REPO_NAME = 'simforge';

export const GITHUB_REPO_URL: string | null = GITHUB_USERNAME
  ? `https://github.com/${GITHUB_USERNAME}/${REPO_NAME}`
  : null;

export const APP_VERSION = '0.1.0-dev';
