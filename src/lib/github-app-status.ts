export type GithubAppInstallationsResponse = {
  authenticated: boolean;
  installed: boolean;
  installationIds: number[];
  repositories: string[];
  primaryRepo: string | null;
  message?: string;
};

export const EMPTY_GITHUB_APP_INSTALLATIONS: GithubAppInstallationsResponse = {
  authenticated: false,
  installed: false,
  installationIds: [],
  repositories: [],
  primaryRepo: null,
};
