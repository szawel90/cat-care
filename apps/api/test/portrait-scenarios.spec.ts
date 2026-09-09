import {
  applyPortraitAnswer,
  calculatePortrait,
  groupPortraitCycles,
  nextPortraitQuestion,
  portraitQuestions,
  toggleProfileChoice,
  validateAttributes,
  type PortraitAnswers,
} from '@cat-care/shared';
import en from '../../web/messages/en.json';
import pl from '../../web/messages/pl.json';

const complete: PortraitAnswers = {
  Q01: 'usual',
  Q02: ['none'],
  Q03: 'none',
  Q04: 'often',
  Q05: 'joins_play',
  Q06: 'rests',
  Q07: 'continues',
  Q08: 'approaches_contact',
  Q09: 'close',
  Q12: 'investigates',
  Q13: 'explores',
  Q14: 'brief_sniff',
  Q15: 'elevated',
  Q16: 'open',
  Q17: 'both',
  Q18: 'settles',
};
function record(overrides: PortraitAnswers = {}) {
  const answers = { ...complete, ...overrides };
  return { answers, followups: {}, result: calculatePortrait(answers) };
}
describe('Situational portrait and continuation', () => {
  it('keeps scenario labels and scored options aligned in both languages', () => {
    for (const [id, question] of Object.entries(portraitQuestions)) {
      for (const language of [en, pl]) {
        const copy = language.Cats.questionnaire.questions as Record<
          string,
          { options: Record<string, string> }
        >;
        expect(Object.keys(copy[id]!.options).sort()).toEqual(
          question.options.map((option) => option.id).sort(),
        );
      }
    }
  });
  it('describes observed withdrawal without treating hiding as more severe than leaving', () => {
    const left = record({ Q06: 'moves_away', Q07: 'moves_away' }).result;
    const hidden = record({ Q06: 'hides', Q07: 'hides' }).result;
    expect(left.axes.caution.point).toBe(4);
    expect(hidden.axes.caution.point).toBe(left.axes.caution.point);
    const tense = record({ Q06: 'still_tense', Q07: 'continues' }).result;
    expect(tense.axes.caution.point).toBeNull();
    expect(tense.axes.caution.status).toBe('context_dependent');
    expect(tense.description.traits).toContainEqual(
      expect.objectContaining({ axis: 'caution', band: 'context' }),
    );
  });
  it('does not turn missing observations, limited resources or unobserved relations into personality claims', () => {
    const result = record({
      Q04: 'deferred',
      Q06: 'deferred',
      Q07: 'deferred',
      Q17: 'neither',
    }).result;
    expect(result.axes.caution.point).toBeNull();
    expect(result.description.traits.some((trait) => trait.axis === 'caution')).toBe(false);
    expect(result.axes.cat_affiliation.point).toBeNull();
    expect(result.axes.cat_affiliation.reasons).toContain('no_observed_target_relationship');
    expect(result.axes.height.status).toBe('observed_use_only');
    expect(result.description.sentenceKeys).not.toContain('traits.activity.high.sentence');
    expect(result.description.sentenceKeys).toContain('partial');
  });
  it('keeps independent dyad dimensions and uses a stored, versioned combined description', () => {
    const result = record({
      Q02: ['one_cat'],
      Q10: 'initiates_greeting',
      Q11: 'moves_away',
      Q06: 'moves_away',
      Q07: 'moves_away',
    }).result;
    expect(result.axes.cat_affiliation.point).toBe(4);
    expect(result.axes.cat_distancing.point).toBe(4);
    expect(result.description.version).toBe('cat-description-1');
    expect(result.description.sentenceKeys).toEqual(
      expect.arrayContaining(['combination.close_cautious', 'combination.social_distance']),
    );
    expect(result.description.sentenceKeys.length).toBeLessThanOrEqual(4);
  });
  it('continues nonadjacent deferred answers, skips completed items and never loops a deferral', () => {
    const state = record({ Q04: 'deferred', Q07: 'deferred' });
    expect(nextPortraitQuestion(state)).toBe('Q04');
    expect(nextPortraitQuestion(state, ['Q04'])).toBe('Q07');
    expect(nextPortraitQuestion(state, ['Q04', 'Q07'])).toBeNull();
    expect(nextPortraitQuestion(record())).toBeNull();
    const edited = applyPortraitAnswer(complete, {}, 'Q02', ['one_cat']);
    const fresh = { ...edited, result: calculatePortrait(edited.answers, edited.followups) };
    expect(nextPortraitQuestion(fresh, ['Q03'])).toBe('Q03');
  });
  it('groups all revisions across dates by assessment rather than answer or calendar day', () => {
    const rows = [
      { revision: 1, assessmentId: 'first', recordedAt: '2026-09-01T10:00:00Z' },
      { revision: 2, assessmentId: 'first', recordedAt: '2026-09-03T10:00:00Z' },
      { revision: 3, assessmentId: 'second', recordedAt: '2026-09-03T10:01:00Z' },
    ].map((row) => ({ ...row, periodStart: '2026-08-20', periodEnd: '2026-09-01' }));
    const cycles = groupPortraitCycles(rows.reverse());
    expect(cycles).toHaveLength(2);
    expect(cycles[1]).toMatchObject({
      number: 1,
      startedAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-03T10:00:00Z',
      latest: { revision: 2 },
    });
  });
  it('preserves old descriptions while validating structured and mutually exclusive selections', () => {
    expect(
      validateAttributes({
        games: 'An earlier free-text observation',
        play: ['morning', 'evening'],
      }),
    ).toEqual({ games: 'An earlier free-text observation', play: ['morning', 'evening'] });
    expect(() => validateAttributes({ games: ['none', 'wand'] })).toThrow();
    expect(() => validateAttributes({ games: ['unexpected'] })).toThrow();
    expect(() => validateAttributes({ rooms: ['one_room'] })).toThrow();
    expect(toggleProfileChoice(['deferred'], 'wand')).toEqual(['wand']);
    expect(toggleProfileChoice(['wand', 'balls'], 'deferred')).toEqual(['deferred']);
    expect(toggleProfileChoice(['wand', 'balls'], 'wand')).toEqual(['balls']);
  });
});
