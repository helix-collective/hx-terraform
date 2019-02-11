/**
 * Configuration for a docker installation
 */
export interface DockerConfig {
  // Flesh out as required
}

export function daemonConfig(cfg: DockerConfig): string {
  return JSON.stringify({ 
    'log-driver': 'json-file' ,
    'log-opts': {
      'max-size': '100m'
    }}, null, 2);
}

export const DEFAULT_CONFIG: DockerConfig = {};
