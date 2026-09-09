'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BARF_PLANNER_VERSION,
  barfCatalog,
  barfNutrients,
  canPlanBarfIngredient,
  isBarfBaseFood,
  type BarfInput,
  type BarfPlan,
  type BarfPlanAssessment,
  type BarfPlanContext,
  type BarfPlannerMode,
  type BarfIngredient,
} from '@cat-care/shared';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function BarfPlanSummary({
  assessment,
  input,
  ingredients = barfCatalog.ingredients,
}: {
  assessment: BarfPlanAssessment;
  input: BarfInput;
  ingredients?: BarfIngredient[];
}) {
  const t = useTranslations('Barf');
  const locale = useLocale() === 'pl' ? 'pl' : 'en';
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
  const owned = new Set(input.planning?.inventory.map((i) => i.ingredientId));
  return (
    <div className="barf-plan-summary">
      <p className="barf-calculation-note">
        {t(assessment.targetsMet ? 'planSourceTargetsMet' : 'planIncomplete')}
      </p>
      {!!assessment.taurineZeroAssumption?.ingredientIds.length && (
        <p className="barf-hint">
          {t('taurineAssumption', {
            names: assessment.taurineZeroAssumption.ingredientIds
              .map((id) => ingredients.find((i) => i.id === id)?.name[locale] ?? id)
              .join(', '),
          })}
        </p>
      )}
      <h3>{t('planProducts', { count: assessment.purchases.length })}</h3>
      <ul className="barf-plan-products">
        {input.items.map((item) => {
          const ingredient = ingredients.find((i) => i.id === item.ingredientId)!;
          return (
            <li key={item.ingredientId}>
              <strong>{ingredient.name[locale]}</strong>
              <span>
                {number.format(item.quantity)} {t(`unit_${ingredient.unit}` as 'unit_g')}
              </span>
              <span className={owned.has(item.ingredientId) ? 'barf-hint' : 'barf-purchase'}>
                {t(owned.has(item.ingredientId) ? 'planOwned' : 'planBuy')}
              </span>
              {!owned.has(item.ingredientId) && (
                <span className="barf-hint">
                  {t('suggestionReason', {
                    reason: t(`rule_${ingredient.suggestion}` as 'rule_taurine'),
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {assessment.unused.length > 0 && (
        <details className="barf-details">
          <summary>{t('planUnused')}</summary>
          <ul>
            {assessment.unused.map((item) => {
              const ingredient = ingredients.find((i) => i.id === item.ingredientId)!;
              return (
                <li key={item.ingredientId}>
                  {ingredient.name[locale]}: {number.format(item.quantity)}{' '}
                  {t(`unit_${ingredient.unit}` as 'unit_g')}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <details className="barf-details">
        <summary>{t('planChecks')}</summary>
        <p className="barf-hint">{t('planCriteria')}</p>
        <ul className="barf-plan-checks">
          {assessment.checks.map((check) => (
            <li key={check.id}>
              <strong>
                {check.id === 'water'
                  ? t('moisture')
                  : check.id === 'fat'
                    ? t('fatDryMatter')
                    : (barfNutrients.find((n) => n.id === check.id)?.name[locale] ??
                      t(check.id as 'calciumPhosphorus'))}
              </strong>
              <span>{t(`planStatus_${check.status}` as 'planStatus_at-reference')}</span>
              <span>
                {check.actual === null ? '—' : number.format(check.actual)} /{' '}
                {number.format(check.target)}{' '}
                {check.id === 'water' || check.id === 'fat'
                  ? '%'
                  : (barfNutrients.find((n) => n.id === check.id)?.unit ?? '')}
              </span>
              {check.missingIngredientIds.length > 0 && (
                <span className="barf-hint">
                  {t('planMissingFrom', {
                    names: check.missingIngredientIds
                      .map((id) => ingredients.find((i) => i.id === id)?.name[locale] ?? id)
                      .join(', '),
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function BarfPlanPanel({
  input,
  mode,
  onApply,
  disabled = false,
}: {
  input: BarfInput;
  mode: BarfPlannerMode;
  onApply: (input: BarfInput) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('Barf');
  const locale = useLocale() === 'pl' ? 'pl' : 'en';
  const [locks, setLocks] = useState<Record<string, boolean>>({});
  const [batch, setBatch] = useState<string | null>(null);
  const [runKey, setRunKey] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; plan?: BarfPlan; error?: boolean } | null>(
    null,
  );
  const worker = useRef<Worker | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const meatStock = input.items.reduce((sum, item) => {
    const ingredient = barfCatalog.ingredients.find((i) => i.id === item.ingredientId)!;
    return (
      sum + (ingredient.category === 'meat' ? item.quantity * (ingredient.gramsPerUnit ?? 0) : 0)
    );
  }, 0);
  const context: BarfPlanContext = useMemo(
    () => ({
      version: BARF_PLANNER_VERSION,
      mode,
      meatGrams: batch === null ? meatStock : Number(batch),
      inventory: input.items.map((item) => {
        const ingredient = barfCatalog.ingredients.find((i) => i.id === item.ingredientId)!;
        return {
          ...item,
          useAll:
            mode === 'supplements' ||
            (locks[item.ingredientId] ??
              (ingredient.category === 'meat' || !canPlanBarfIngredient(ingredient))),
        };
      }),
    }),
    [input.items, locks, batch, meatStock, mode],
  );
  const key = JSON.stringify([input, context]);
  const current = outcome?.key === key ? outcome : null;
  const running = runKey === key && !current;
  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [key],
  );
  const baseOnly =
    mode !== 'supplements' ||
    input.items.every((item) =>
      isBarfBaseFood(barfCatalog.ingredients.find((i) => i.id === item.ingredientId)!),
    );
  const valid =
    baseOnly &&
    input.items.length > 0 &&
    context.meatGrams > 0 &&
    context.meatGrams <= meatStock &&
    context.inventory.every(
      (i) => Number.isFinite(i.quantity) && i.quantity >= 0.001 && i.quantity <= 100_000,
    );
  function start() {
    worker.current?.terminate();
    setRunKey(key);
    setOutcome(null);
    try {
      const instance = new Worker(new URL('../workers/barf-planner.ts', import.meta.url), {
        type: 'module',
      });
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<{ plan?: BarfPlan; error?: boolean }>) => {
        setOutcome({ key, ...event.data });
        instance.terminate();
        requestAnimationFrame(() => heading.current?.focus());
      };
      instance.onerror = () => {
        setOutcome({ key, error: true });
        instance.terminate();
      };
      instance.postMessage({ input, context });
    } catch {
      setOutcome({ key, error: true });
    }
  }
  return (
    <section className="barf-panel barf-no-print" aria-labelledby="barf-plan-heading">
      <h2 id="barf-plan-heading">{t('planHeading')}</h2>
      <p className="barf-hint">
        {t(mode === 'supplements' ? 'planSupplementsInstructions' : 'planInstructions')}
      </p>
      {!baseOnly && <p role="alert">{t('planRemoveSupplements')}</p>}
      <fieldset disabled={disabled || running}>
        <legend className="sr-only">{t('planInventory')}</legend>
        {mode === 'inventory' && (
          <>
            <ul className="barf-stock-locks">
              {context.inventory.map((item) => {
                const ingredient = barfCatalog.ingredients.find((i) => i.id === item.ingredientId)!;
                const fixed = ingredient.category !== 'meat' && !canPlanBarfIngredient(ingredient);
                return (
                  <li key={item.ingredientId}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.useAll}
                        disabled={fixed}
                        onChange={(event) =>
                          setLocks({ ...locks, [item.ingredientId]: event.target.checked })
                        }
                      />
                      {t('planUseAll', { name: ingredient.name[locale] })}
                    </label>
                    {fixed && <p className="barf-hint">{t('planManualUnit')}</p>}
                  </li>
                );
              })}
            </ul>
            <Label htmlFor="barf-plan-batch">{t('planBatch')}</Label>
            <Input
              id="barf-plan-batch"
              type="number"
              inputMode="decimal"
              min="0.001"
              max={Math.min(100_000, meatStock)}
              step="any"
              value={batch ?? (meatStock || '')}
              onChange={(event) => setBatch(event.target.value)}
            />
            <p className="barf-hint">{t('planBatchHint')}</p>
          </>
        )}
        <Button type="button" disabled={!valid} onClick={start}>
          {t(running ? 'planRunning' : 'planFind')}
        </Button>
      </fieldset>
      <div role="status" aria-live="polite">
        {running && <p>{t('planRunning')}</p>}
      </div>
      {current && (
        <div className="barf-plan-result">
          <h3 tabIndex={-1} ref={heading}>
            {t('planResult')}
          </h3>
          {current.error ? (
            <p role="alert">{t('planError')}</p>
          ) : (
            current.plan && (
              <>
                <p>{t('planSearchNote', { count: current.plan.checkedCombinations })}</p>
                {current.plan.searchLimited && <p className="barf-hint">{t('planLimited')}</p>}
                {!current.plan.input ? (
                  <p>{t('planNoProposal')}</p>
                ) : (
                  <>
                    {current.plan.status === 'no-improvement' && <p>{t('planNoImprovement')}</p>}
                    <BarfPlanSummary input={current.plan.input} assessment={current.plan} />
                    <Button
                      type="button"
                      disabled={disabled}
                      onClick={() => onApply(current.plan!.input!)}
                    >
                      {t('planApply')}
                    </Button>
                  </>
                )}
              </>
            )
          )}
        </div>
      )}
    </section>
  );
}
