import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyPortraitAnswer,
  calculatePortrait,
  householdAnswer,
  nextQuestion,
  unknownHousehold,
  validateAttributes,
  type PortraitAnswers,
  type PortraitFollowups,
} from '@cat-care/shared';

describe('Cat portrait rules', () => {
  const fixtures = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures/portrait-reference.json'), 'utf8'),
  ) as Array<{ answers: PortraitAnswers; followups: PortraitFollowups; expected: object }>;
  it.each(fixtures.map((fixture, index) => [index, fixture] as const))(
    'matches offline reference case %i',
    (_index, fixture) => {
      // JSON normalization removes undefined optional properties, just as transport does.
      const actual = JSON.parse(
        JSON.stringify(calculatePortrait(fixture.answers, fixture.followups)),
      );
      for (const axis of Object.values(actual.axes) as Array<{
        items: Array<{ answer?: unknown }>;
      }>)
        for (const item of axis.items) item.answer ??= null;
      expect(actual).toEqual(fixture.expected);
    },
  );
  it('keeps zero, unknown, deferred and disagreement distinct', () => {
    expect(calculatePortrait({ Q04: 'never', Q05: 'never' }).axes.activity.point).toBe(0);
    const deferred = calculatePortrait({ Q04: 'deferred', Q05: 'almost_always' });
    expect(deferred.axes.activity.point).toBe(4);
    expect(deferred.axes.activity.status).toBe('single_indicator');
    expect(deferred.pending).toEqual([{ id: 'Q04', state: 'awaiting_observation' }]);
    const varied = calculatePortrait({ Q04: 'never', Q05: 'almost_always' });
    expect(varied.axes.activity.point).toBeNull();
    expect(varied.axes.activity.range).toEqual([0, 4]);
    expect(calculatePortrait({ Q04: 'unknown' }).axes.activity.point).toBeNull();
  });
  it('does not award temperament points for household composition', () => {
    const answers = { Q03: 'none', Q04: 'often', Q05: 'almost_always' };
    expect(calculatePortrait({ ...answers, Q02: ['children', 'dogs'] }).vector).toEqual(
      calculatePortrait({ ...answers, Q02: ['none'] }).vector,
    );
  });
  it('invalidates dependent dyad answers when the target changes', () => {
    const original = { Q02: ['multiple_cats'], Q10: 'often', Q11: 'never' };
    const changed = applyPortraitAnswer(original, { F_TARGET: 'Luna' }, 'F_TARGET', 'Nori');
    expect(changed.answers.Q10).toBeUndefined();
    expect(changed.answers.Q11).toBeUndefined();
    expect(original.Q10).toBe('often');
  });
  it('does not invent spatial preferences without real choice and calm rest', () => {
    const result = calculatePortrait({
      Q15: 'floor',
      Q16: 'open',
      Q17: 'cover_only',
      Q18: 'often',
    });
    expect(result.axes.height.observed_point).toBe(0);
    expect(result.axes.height.point).toBeNull();
    expect(result.axes.openness.point).toBe(4);
  });
  it('rejects numeric scores, unknown keys and incoherent household answers', () => {
    expect(() => calculatePortrait({ Q04: 4 } as unknown as PortraitAnswers)).toThrow();
    expect(() => calculatePortrait({ bad: 'often' })).toThrow();
    expect(() => calculatePortrait({ Q02: ['none', 'children'] })).toThrow();
    expect(() => calculatePortrait({ Q02: ['none'], Q03: 'dogs' })).toThrow();
    expect(() => calculatePortrait({ Q10: 'often' })).toThrow();
    expect(() => validateAttributes({ ownerId: 'another-owner' })).toThrow();
  });
  it('never issues a third clarification after earlier answers are revised', () => {
    const complete = {
      Q01: 'usual',
      Q02: ['none'],
      Q03: 'none',
      Q04: 'never',
      Q05: 'almost_always',
      Q06: 'often',
      Q07: 'often',
      Q08: 'often',
      Q09: 'often',
      Q12: 'often',
      Q13: 'often',
      Q14: 'often',
      Q15: 'floor',
      Q16: 'open',
      Q17: 'neither',
      Q18: 'never',
    };
    expect(nextQuestion(complete, {}, ['F_TARGET', 'F_CONTEXT'])).toBeNull();
    expect(
      nextQuestion({ ...complete, Q02: ['multiple_cats'] }, {}, ['F_SPACE', 'F_VARIATION']),
    ).toBeNull();
    expect(
      calculatePortrait({ ...complete, Q02: ['multiple_cats'] }, {}, ['F_SPACE', 'F_VARIATION'])
        .axes.cat_affiliation.point,
    ).toBeNull();
  });
  it('prefills known shared facts without double-counting a newly registered housemate', () => {
    const facts = {
      ...unknownHousehold,
      children: 'yes',
      dogs: 'no',
      other_animals: 'no',
      totalCats: 'two',
    } as const;
    expect(householdAnswer(facts, 2)).toEqual(['children', 'one_cat']);
    expect(householdAnswer(facts, 3)).toEqual(['children', 'multiple_cats']);
    expect(householdAnswer(unknownHousehold, 2)).toBeNull();
  });
});
