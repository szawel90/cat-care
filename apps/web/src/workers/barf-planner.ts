import { planBarf, type BarfInput, type BarfPlanContext } from '@cat-care/shared';

self.addEventListener(
  'message',
  (event: MessageEvent<{ input: BarfInput; context: BarfPlanContext }>) => {
    try {
      self.postMessage({ plan: planBarf(event.data.input, event.data.context) });
    } catch {
      self.postMessage({ error: true });
    }
  },
);
