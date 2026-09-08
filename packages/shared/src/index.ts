export type HealthStatus = 'ok' | 'not_ready';

export interface ServiceHealth {
  status: HealthStatus;
}
