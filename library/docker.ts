/**
 * Configuration for a docker installation
 */
export interface DockerConfig {
  install: DockerInstallConfig;

  // todo: flesh out types for daemonConfig
};

export interface DockerInstallConfig {
  dockerComposeVersion: string
};

export function daemonConfig(cfg: DockerConfig): string {
  return JSON.stringify(
    {
      'log-driver': 'json-file',
      'log-opts': {
        'max-size': '100m',
      },
    },
    null,
    2
  );
}

export const DEFAULT_CONFIG: DockerConfig = {
  install: {
    dockerComposeVersion: "1.14.0",
  }
};
