export type HealthStatus = 'ok' | 'not_ready';

export interface ServiceHealth {
  status: HealthStatus;
}

export * from './cats';
export * from './portrait';
export * from './portrait-catalog';

export {
  calculatePortrait as calculatePortraitV1,
  applyPortraitAnswer as applyPortraitAnswerV1,
  nextQuestion as nextQuestionV1,
} from './portrait-v1';
export * from './portrait-description';
export * from './portrait-navigation';
export * from './profile-choices';
