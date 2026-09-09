'use client';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Cat, Heart, Home, Pencil, Sparkles, Users, Clock } from 'lucide-react';
import {
  profileFields,
  type CatRecord,
  type PortraitRecord,
  type ProfileArea,
} from '@cat-care/shared';
import { CatAvatar } from './cat-picker';
import { CatPortraitSummary } from './cat-portrait-result';
import { useCatMessages } from './cat-messages';
import { Button } from './ui/button';

export function CatProfileOverview({
  cat,
  portrait,
  onIdentity,
  onArea,
  actions,
}: {
  actions?: ReactNode;
  cat: CatRecord;
  portrait: PortraitRecord | null;
  onIdentity: () => void;
  onArea: (area: ProfileArea) => void;
}) {
  const t = useTranslations('Cats'),
    copy = useCatMessages();
  const choices = copy.choiceLabels as Record<string, string>,
    options = copy.options as Record<string, string>;
  const fields = copy.fields as Record<string, string>;
  const areas = ['about', 'home', 'household', 'routine', 'preferences', 'health'] as const;
  const icons = {
    about: Cat,
    home: Home,
    household: Users,
    routine: Clock,
    preferences: Sparkles,
    health: Heart,
  };
  const display = (value: string | string[]) =>
    (Array.isArray(value) ? value : [value])
      .map((item) => choices[item] ?? options[item] ?? item)
      .join(', ');
  function preview(area: ProfileArea) {
    if (area === 'health') return t('healthUnavailable');
    if (area === 'household') {
      const names = cat.household.members
        .filter((other) => other.id !== cat.id)
        .map((other) => other.name);
      const known = Object.entries(cat.household.facts).filter(
        ([, value]) => !['unknown', 'deferred'].includes(value),
      );
      return names.length
        ? t('sharedWith', { names: names.join(', ') })
        : known.length
          ? known.map(([key, value]) => `${fields[key]}: ${options[value]}`).join(' · ')
          : t('notProvided');
    }
    const values = profileFields[area].map((key) =>
      area === 'home' && key !== 'access' ? cat.household.environment[key] : cat.attributes[key],
    );
    const present = values.filter((value): value is string | string[] => Boolean(value?.length));
    const deferred = present.some(
      (value) => value === 'deferred' || (Array.isArray(value) && value.includes('deferred')),
    );
    const known = present.filter(
      (value) => value !== 'deferred' && !(Array.isArray(value) && value.includes('deferred')),
    );
    return (
      [known.slice(0, 2).map(display).join(' · '), deferred ? t('pending') : '']
        .filter(Boolean)
        .join(' · ') || t('notProvided')
    );
  }
  return (
    <>
      <section className="cat-profile-heading">
        <div className="cat-identity">
          <CatAvatar cat={cat} large />
          <div>
            <h2>{cat.name}</h2>
            {typeof cat.attributes.age === 'string' && (
              <p className="hint">
                {cat.attributes.age === 'deferred' ? t('pending') : cat.attributes.age}
              </p>
            )}
          </div>
          {!cat.archivedAt && (
            <Button
              variant="ghost"
              className="cat-icon-button"
              aria-label={t('editIdentity')}
              onClick={onIdentity}
            >
              <Pencil aria-hidden="true" size={18} />
            </Button>
          )}
        </div>
        <div>
          {portrait ? (
            <CatPortraitSummary portrait={portrait} compact />
          ) : (
            <p className="cat-summary">{t('summaryEmpty', { name: cat.name })}</p>
          )}
          {actions}
        </div>
      </section>
      <div className="cat-area-grid">
        {areas.map((area) => {
          const Icon = icons[area];
          return (
            <button
              key={area}
              type="button"
              className="cat-area cat-area-button"
              aria-label={
                area === 'health' ? t('areas.health') : `${t('edit')}: ${t(`areas.${area}`)}`
              }
              disabled={area === 'health' || Boolean(cat.archivedAt)}
              onClick={() => onArea(area)}
            >
              <Icon aria-hidden="true" size={22} />
              <span className="cat-area-copy">
                <strong>{t(`areas.${area}`)}</strong>
                <span>{preview(area)}</span>
              </span>
              {area !== 'health' && (
                <Pencil className="cat-area-pencil" aria-hidden="true" size={16} />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
