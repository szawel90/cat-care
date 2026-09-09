export type HealthStatus = 'ok' | 'not_ready';

export interface ServiceHealth {
  status: HealthStatus;
}

export * from './cats';
export * from './portrait';
export * from './portrait-catalog';
