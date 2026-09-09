'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleHelp, Download, Plus, Printer, Star, Trash2 } from 'lucide-react';
import {
  barfCatalog,
  barfNutrients,
  calculateBarf,
  suggestBarfQuantity,
  type BarfInput,
  type BarfSnapshot,
} from '@cat-care/shared';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface BarfEditorProps {
  input: BarfInput;
  onChange: (input: BarfInput) => void;
  favorites: string[];
  onFavorite: (id: string) => void;
  onSave: () => void;
  busy?: boolean;
  readOnly?: boolean;
  snapshot?: BarfSnapshot;
}

export function BarfEditor({
  input,
  onChange,
  favorites,
  onFavorite,
  onSave,
  busy = false,
  readOnly = false,
  snapshot,
}: BarfEditorProps) {
  const t = useTranslations('Barf');
  const locale = useLocale() === 'pl' ? 'pl' : 'en';
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );
  const number = (value: number | null) => (value === null ? '—' : formatter.format(value));
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const sourceIngredients = snapshot?.ingredients ?? barfCatalog.ingredients;
  const ingredientById = new Map(sourceIngredients.map((item) => [item.id, item]));
  const selected = barfCatalog.ingredients.find((item) => item.id === selectedId);
  const found = barfCatalog.ingredients.filter(
    (item) =>
      (category === 'all' || category === item.category) &&
      (!favoritesOnly || favorites.includes(item.id)) &&
      `${item.name.en} ${item.name.pl}`
        .toLocaleLowerCase(locale)
        .includes(query.trim().toLocaleLowerCase(locale)),
  );
  let result: BarfSnapshot['result'] | null = null;
  let suggestion: ReturnType<typeof suggestBarfQuantity> | null = null;
  try {
    result = snapshot?.result ?? calculateBarf(input);
    if (selected?.suggestion && !readOnly) suggestion = suggestBarfQuantity(input, selected.id);
  } catch {
    // An incomplete number field is a draft, not a valid calculation.
  }
  const validQuantity =
    Number.isFinite(Number(quantity)) && Number(quantity) >= 0.001 && Number(quantity) <= 100_000;
  const blocked = busy || readOnly;
  const setField = <K extends keyof BarfInput>(key: K, value: BarfInput[K]) =>
    onChange({ ...input, [key]: value });
  const unit = (name: string) => t(`unit_${name}` as 'unit_g');

  function add() {
    if (!selected || !validQuantity) return;
    const item = { ingredientId: selected.id, quantity: Number(quantity) };
    setField(
      'items',
      input.items.some((line) => line.ingredientId === selected.id)
        ? input.items.map((line) => (line.ingredientId === selected.id ? item : line))
        : [...input.items, item],
    );
  }
  function shoppingList() {
    const text = [
      input.title,
      t('draftNotice'),
      '',
      ...input.items.map((item) => {
        const ingredient = ingredientById.get(item.ingredientId)!;
        return `${ingredient.name[locale]}: ${number(item.quantity)} ${unit(ingredient.unit)}`;
      }),
      '',
      t('sourceModel'),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'cat-care-shopping-list.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <form
        className="barf-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (result && !blocked) onSave();
        }}
      >
        <div className="barf-ingredients-column">
          <section className="barf-panel" aria-labelledby="barf-details-title">
            <h2 id="barf-details-title">{t('recipeDetails')}</h2>
            <fieldset disabled={blocked} className="barf-fields">
              <legend className="sr-only">{t('recipeDetails')}</legend>
              <div className="barf-wide-field">
                <Label htmlFor="barf-title">{t('recipeName')}</Label>
                <Input
                  id="barf-title"
                  value={input.title}
                  required
                  maxLength={100}
                  onChange={(event) => setField('title', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="barf-cat">{t('catName')}</Label>
                <Input
                  id="barf-cat"
                  value={input.catName}
                  maxLength={80}
                  onChange={(event) => setField('catName', event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="barf-weight">{t('catWeight')}</Label>
                <Input
                  id="barf-weight"
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  max="30"
                  step="any"
                  required
                  value={input.catWeightKg || ''}
                  onChange={(event) => setField('catWeightKg', Number(event.target.value))}
                  aria-describedby="barf-weight-hint"
                />
              </div>
            </fieldset>
            <p id="barf-weight-hint" className="barf-hint">
              {t('weightHint')}
            </p>
          </section>

          {!readOnly && (
            <section className="barf-panel barf-no-print" aria-labelledby="barf-add-title">
              <h2 id="barf-add-title">{t('addIngredients')}</h2>
              <fieldset disabled={busy}>
                <legend className="sr-only">{t('addIngredients')}</legend>
                <Label htmlFor="barf-search">{t('search')}</Label>
                <Input
                  id="barf-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="barf-filter-row">
                  <div>
                    <Label htmlFor="barf-category">{t('category')}</Label>
                    <select
                      id="barf-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {[
                        'all',
                        'meat',
                        'fish',
                        'supplement',
                        'fat',
                        'premix',
                        'vegetable',
                        'water',
                      ].map((item) => (
                        <option key={item} value={item}>
                          {t(`category_${item}` as 'category_all')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={favoritesOnly}
                    onClick={() => setFavoritesOnly(!favoritesOnly)}
                  >
                    <Star aria-hidden="true" />
                    {t('favorites')}
                  </Button>
                </div>
                <Label htmlFor="barf-ingredient">{t('ingredient')}</Label>
                <select
                  id="barf-ingredient"
                  value={found.some((item) => item.id === selectedId) ? selectedId : ''}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    const next = barfCatalog.ingredients.find(
                      (item) => item.id === event.target.value,
                    );
                    setQuantity(
                      next && ['supplement', 'premix'].includes(next.category) ? '1' : '100',
                    );
                  }}
                >
                  <option value="">{found.length ? t('chooseIngredient') : t('noResults')}</option>
                  {found.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name[locale]} · {unit(ingredient.unit)}
                    </option>
                  ))}
                </select>
                {selected && found.some((item) => item.id === selectedId) && (
                  <>
                    <div className="barf-filter-row">
                      <div>
                        <Label htmlFor="barf-quantity">
                          {t('quantity', { unit: unit(selected.unit) })}
                        </Label>
                        <Input
                          id="barf-quantity"
                          type="number"
                          inputMode="decimal"
                          min="0.001"
                          max="100000"
                          step="any"
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        aria-pressed={favorites.includes(selected.id)}
                        aria-label={
                          favorites.includes(selected.id) ? t('removeFavorite') : t('addFavorite')
                        }
                        onClick={() => onFavorite(selected.id)}
                      >
                        <Star
                          aria-hidden="true"
                          fill={favorites.includes(selected.id) ? 'currentColor' : 'none'}
                        />
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          !validQuantity ||
                          (input.items.length >= 200 &&
                            !input.items.some((item) => item.ingredientId === selectedId))
                        }
                        onClick={add}
                      >
                        <Plus aria-hidden="true" />
                        {input.items.some((item) => item.ingredientId === selected.id)
                          ? t('replaceAmount')
                          : t('add')}
                      </Button>
                    </div>
                    {suggestion && (
                      <div className="barf-calculation-note">
                        <p>
                          {t('suggestionReason', {
                            reason: t(`rule_${suggestion.reason}` as 'rule_taurine'),
                          })}
                        </p>
                        {suggestion.quantity !== null ? (
                          <>
                            <strong>
                              {t('suggestedQuantity', {
                                quantity: number(suggestion.quantity),
                                unit: unit(selected.unit),
                              })}
                            </strong>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={suggestion.quantity <= 0}
                              onClick={() => setQuantity(String(suggestion.quantity))}
                            >
                              {t('useSuggestion')}
                            </Button>
                            <p className="barf-hint">{t('suggestionHint')}</p>
                          </>
                        ) : (
                          <p>
                            {suggestion.missingIngredientIds.length
                              ? t('suggestionMissing')
                              : t('suggestionUnavailable')}
                          </p>
                        )}
                      </div>
                    )}
                    <details className="barf-source-details">
                      <summary>{t('ingredientSource')}</summary>
                      <p>
                        {selected.source.label ?? t('sourceNotSpecified')} · {selected.source.sheet}
                        , {selected.source.row}
                      </p>
                      <p>{t('sourceUnverified')}</p>
                    </details>
                  </>
                )}
              </fieldset>
            </section>
          )}

          <section className="barf-panel" aria-labelledby="barf-ingredients-title">
            <h2 id="barf-ingredients-title">
              {t('yourIngredients', { count: input.items.length })}
            </h2>
            {input.items.length === 0 ? (
              <p className="barf-hint">{t('emptyIngredients')}</p>
            ) : (
              <ul className="barf-item-list">
                {input.items.map((item, index) => {
                  const ingredient = ingredientById.get(item.ingredientId)!;
                  return (
                    <li key={item.ingredientId}>
                      <div>
                        <strong>{ingredient.name[locale]}</strong>
                        <span className="barf-hint">
                          {t(`category_${ingredient.category}` as 'category_meat')}
                        </span>
                      </div>
                      <div className="barf-item-amount">
                        <Label htmlFor={`barf-line-${index}`} className="sr-only">
                          {t('ingredientQuantity', {
                            name: ingredient.name[locale],
                            unit: unit(ingredient.unit),
                          })}
                        </Label>
                        <Input
                          id={`barf-line-${index}`}
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.001"
                          max="100000"
                          required
                          disabled={blocked}
                          value={item.quantity || ''}
                          onChange={(event) =>
                            setField(
                              'items',
                              input.items.map((line, i) =>
                                i === index
                                  ? { ...line, quantity: Number(event.target.value) }
                                  : line,
                              ),
                            )
                          }
                        />
                        <span>{unit(ingredient.unit)}</span>
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            aria-label={t('removeIngredient', { name: ingredient.name[locale] })}
                            onClick={() =>
                              setField(
                                'items',
                                input.items.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="barf-summary-column" aria-labelledby="barf-balance-title">
          <section className="barf-panel barf-summary">
            <h2 id="barf-balance-title">{t('balance')}</h2>
            <div className="barf-draft-notice">
              <CircleHelp aria-hidden="true" />
              <p>{t('draftNotice')}</p>
            </div>
            {!result ? (
              <p role="status">{t('invalidDraft')}</p>
            ) : (
              <>
                <dl className="barf-metrics" aria-live="polite" aria-atomic="true">
                  <div>
                    <dt>{t('mixture')}</dt>
                    <dd>
                      {number(result.knownMixtureGrams)} g{result.massIncomplete ? '*' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('portion')}</dt>
                    <dd>{number(result.dailyPortionGrams)} g</dd>
                  </div>
                  <div>
                    <dt>{t('days')}</dt>
                    <dd>{number(result.days)}</dd>
                  </div>
                  <div>
                    <dt>{t('missingNutrients')}</dt>
                    <dd>{result.missingNutrientCount}</dd>
                  </div>
                </dl>
                {result.meatGrams === 0 && <p>{t('needMeat')}</p>}
                {result.massIncomplete && <p className="barf-hint">{t('massIncomplete')}</p>}
                {result.missingNutrientCount > 0 && (
                  <p className="barf-hint">{t('missingExplanation')}</p>
                )}
                <details className="barf-details">
                  <summary>{t('ratios')}</summary>
                  <dl className="barf-ratios">
                    <div>
                      <dt>{t('calciumPhosphorus')}</dt>
                      <dd>{number(result.calciumPhosphorus)}</dd>
                    </div>
                    <div>
                      <dt>{t('potassiumSodium')}</dt>
                      <dd>{number(result.potassiumSodium)}</dd>
                    </div>
                    <div>
                      <dt>{t('moisture')}</dt>
                      <dd>{number(result.moisturePercent)}%</dd>
                    </div>
                    <div>
                      <dt>{t('proteinDryMatter')}</dt>
                      <dd>{number(result.proteinDryMatterPercent)}%</dd>
                    </div>
                    <div>
                      <dt>{t('fatDryMatter')}</dt>
                      <dd>{number(result.fatDryMatterPercent)}%</dd>
                    </div>
                  </dl>
                </details>
                <details className="barf-details">
                  <summary>{t('nutrientDetails')}</summary>
                  <p className="barf-hint">{t('referenceExplanation')}</p>
                  <table className="barf-nutrients">
                    <caption className="sr-only">{t('nutrientDetails')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('nutrient')}</th>
                        <th scope="col">{t('knownTotal')}</th>
                        <th scope="col">{t('sourceReference')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barfNutrients.map((nutrient) => {
                        const value = result.nutrients[nutrient.id];
                        return (
                          <tr key={nutrient.id}>
                            <th scope="row">
                              {nutrient.name[locale]} <small>({nutrient.unit})</small>
                              {value.missingIngredientIds.length > 0 && (
                                <details>
                                  <summary>
                                    {t('missingFor', { count: value.missingIngredientIds.length })}
                                  </summary>
                                  <ul>
                                    {value.missingIngredientIds.map((id) => (
                                      <li key={id}>{ingredientById.get(id)?.name[locale] ?? id}</li>
                                    ))}
                                  </ul>
                                </details>
                              )}
                            </th>
                            <td>
                              {number(value.knownTotal)}
                              {value.missingIngredientIds.length > 0 ? '*' : ''}
                            </td>
                            <td>{number(value.reference)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              </>
            )}
            <details className="barf-details">
              <summary>{t('method')}</summary>
              <p>{t('sourceModel')}</p>
              <p>{t('roundingNote')}</p>
              <p className="barf-hint">
                {input.catalogVersion} · {input.engineVersion}
              </p>
            </details>
            <div className="barf-save-actions barf-no-print">
              {!readOnly && (
                <Button
                  type="submit"
                  disabled={busy || !result || result.meatGrams <= 0 || !input.title.trim()}
                >
                  {busy ? t('saving') : t('saveRecipe')}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!result || !input.items.length}
                onClick={() => window.print()}
              >
                <Printer aria-hidden="true" />
                {t('print')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!input.items.length}
                onClick={shoppingList}
              >
                <Download aria-hidden="true" />
                {t('shoppingList')}
              </Button>
            </div>
          </section>
        </aside>
      </form>
      <section className="barf-print-only">
        <h1>{input.title}</h1>
        <p>
          {input.catName} · {number(input.catWeightKg)} kg
        </p>
        <p>{t('draftNotice')}</p>
        <ul>
          {input.items.map((item) => {
            const ingredient = ingredientById.get(item.ingredientId)!;
            return (
              <li key={item.ingredientId}>
                {ingredient.name[locale]} — {number(item.quantity)} {unit(ingredient.unit)}
              </li>
            );
          })}
        </ul>
        <p>
          {t('portion')}: {number(result?.dailyPortionGrams ?? null)} g · {t('days')}:{' '}
          {number(result?.days ?? null)}
        </p>
        <p>
          {t('missingNutrients')}: {result?.missingNutrientCount ?? '—'}
        </p>
        <p>{t('sourceModel')}</p>
        <p>
          {input.catalogVersion} · {input.engineVersion}
        </p>
      </section>
    </>
  );
}
