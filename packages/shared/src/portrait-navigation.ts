import { nextQuestion, type PortraitRecord } from './portrait';

/** Pending questions are visited once per continuation, including newly applicable questions. */
export function nextPortraitQuestion(
  portrait: Pick<PortraitRecord, 'answers' | 'followups' | 'result'>,
  visited: readonly string[] = [],
): string | null {
  const fresh = portrait.result.next_question?.id;
  if (fresh) return fresh;
  const pending = portrait.result.pending
    .map((item) => item.id)
    .filter((id) => !visited.includes(id));
  return pending[0] ?? null;
}

/** Listing only applicable base questions avoids reopening a skipped dyad after a home edit. */
export function answeredPortraitQuestions(
  portrait: Pick<PortraitRecord, 'answers' | 'followups'>,
): string[] {
  // Calling the route validator makes invalid cross-target data fail rather than look editable.
  nextQuestion(portrait.answers, portrait.followups);
  return [...Object.keys(portrait.answers), ...Object.keys(portrait.followups)].filter((id) => {
    const answer = portrait.answers[id] ?? portrait.followups[id];
    return answer !== 'deferred' && !(Array.isArray(answer) && answer.includes('deferred'));
  });
}

export interface PortraitCycleRevision {
  revision: number;
  assessmentId: string;
  recordedAt: string;
  periodStart: string;
  periodEnd: string;
  profileStatus?: string;
}
export function groupPortraitCycles(rows: readonly PortraitCycleRevision[]) {
  const cycles = new Map<
    string,
    {
      assessmentId: string;
      startedAt: string;
      updatedAt: string;
      latest: PortraitCycleRevision;
      count: number;
    }
  >();
  for (const row of [...rows].sort((a, b) => a.revision - b.revision)) {
    const cycle = cycles.get(row.assessmentId);
    if (!cycle)
      cycles.set(row.assessmentId, {
        assessmentId: row.assessmentId,
        startedAt: row.recordedAt,
        updatedAt: row.recordedAt,
        latest: row,
        count: 1,
      });
    else {
      cycle.updatedAt = row.recordedAt;
      cycle.latest = row;
      cycle.count++;
    }
  }
  return [...cycles.values()].map((cycle, index) => ({ ...cycle, number: index + 1 })).reverse();
}
