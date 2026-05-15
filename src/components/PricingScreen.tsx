import { useState, type ReactNode } from 'react';
import { useBillingStore } from '../store/billingStore';
import { createCheckoutSession } from '../lib/billing';
import { isPro, FREE_LIMITS } from '../types/billing';
import type { Plan } from '../types/billing';
import { PointWordmark } from './PointWordmark';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useT } from '../hooks/useT';
import type { MessageKey } from '../locales/messages';

interface Props {
  userBar?: ReactNode;
  onBack?: () => void;
}

type PlanCardId = 'free' | 'pro_monthly' | 'pro_yearly';

interface PlanDef {
  id: PlanCardId;
  price: string;
  titleKey: MessageKey;
  priceSubKey: MessageKey;
  featureKeys: MessageKey[];
  highlighted?: boolean;
}

const PLAN_DEFS: PlanDef[] = [
  {
    id: 'free',
    price: '$0',
    titleKey: 'pricing.plan.free.title',
    priceSubKey: 'pricing.plan.free.priceSub',
    featureKeys: [
      'pricing.plan.free.f0',
      'pricing.plan.free.f1',
      'pricing.plan.free.f2',
      'pricing.plan.free.f3',
      'pricing.plan.free.f4',
    ],
  },
  {
    id: 'pro_monthly',
    price: '$9.99',
    titleKey: 'pricing.plan.pro.title',
    priceSubKey: 'pricing.plan.pro.priceSub',
    highlighted: true,
    featureKeys: [
      'pricing.plan.pro.f0',
      'pricing.plan.pro.f1',
      'pricing.plan.pro.f2',
      'pricing.plan.pro.f3',
      'pricing.plan.pro.f4',
      'pricing.plan.pro.f5',
    ],
  },
  {
    id: 'pro_yearly',
    price: '$79',
    titleKey: 'pricing.plan.yearly.title',
    priceSubKey: 'pricing.plan.yearly.priceSub',
    featureKeys: ['pricing.plan.yearly.f0', 'pricing.plan.yearly.f1', 'pricing.plan.yearly.f2'],
  },
];

export function PricingScreen({ userBar, onBack }: Props) {
  const t = useT();
  const subscription = useBillingStore((s) => s.subscription);
  const [busyPlan, setBusyPlan] = useState<PlanCardId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan: Plan = subscription?.plan ?? 'free';
  const userIsPro = isPro(subscription);

  const handleSelect = async (plan: PlanCardId) => {
    setError(null);
    if (plan === 'free') return;
    if (plan === currentPlan && userIsPro) return;
    setBusyPlan(plan);
    try {
      const url = await createCheckoutSession(plan);
      if (!url) {
        setError(t('pricing.checkoutError'));
        return;
      }
      window.location.href = url;
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <main id="screen-pricing" className="point-screen screen-pricing" role="main">
      <div className="home-notebook-sheet">
        <nav className="home-topnav" aria-label={t('pricing.navAria')}>
          <div className="home-topnav-brand">
            <PointWordmark
              onHomeClick={onBack}
              ariaLabel={t('nav.pointBack')}
              className="home-topnav-wordmark"
            />
          </div>
          <div className="home-topnav-links">
            <LanguageSwitcher className="lang-switcher--topnav" />
            {onBack && (
              <button type="button" className="home-topnav-link" onClick={onBack}>
                {t('nav.back')}
              </button>
            )}
            {userBar}
          </div>
        </nav>

        <section className="pricing-section">
          <div className="pricing-inner">
            <p className="home-persona-eyebrow">{t('pricing.eyebrow')}</p>
            <h1 className="home-persona-heading">{t('pricing.title')}</h1>
            <p className="home-persona-lead">
              {t('pricing.lead', {
                minutes: String(FREE_LIMITS.maxDurationSec / 60),
                sessions: String(FREE_LIMITS.monthlySessions),
              })}
            </p>

            {error && <div className="pricing-error" role="alert">{error}</div>}

            <div className="pricing-cards">
              {PLAN_DEFS.map((card) => {
                const isCurrent = card.id === currentPlan;
                const isBusy = busyPlan === card.id;
                return (
                  <article
                    key={card.id}
                    className={[
                      'pricing-card',
                      card.highlighted ? 'pricing-card--highlight' : '',
                      isCurrent ? 'pricing-card--current' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {card.highlighted && <span className="pricing-card-badge">{t('pricing.badgeRecommended')}</span>}
                    <h2 className="pricing-card-title">{t(card.titleKey)}</h2>
                    <div className="pricing-card-price">
                      <span className="pricing-card-price-num">{card.price}</span>
                      <span className="pricing-card-price-sub">{t(card.priceSubKey)}</span>
                    </div>
                    <ul className="pricing-card-features">
                      {card.featureKeys.map((fk) => (
                        <li key={fk}>{t(fk)}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={[
                        'pricing-card-cta',
                        card.highlighted ? 'pricing-card-cta--primary' : '',
                      ].filter(Boolean).join(' ')}
                      disabled={isCurrent || isBusy || card.id === 'free'}
                      onClick={() => void handleSelect(card.id)}
                    >
                      {isCurrent
                        ? t('pricing.cta.current')
                        : card.id === 'free'
                          ? t('pricing.cta.freeForever')
                          : isBusy
                            ? t('pricing.cta.loading')
                            : userIsPro
                              ? t('pricing.cta.switch')
                              : t('pricing.cta.upgrade')}
                    </button>
                  </article>
                );
              })}
            </div>

            <p className="pricing-note">{t('pricing.note')}</p>
          </div>
        </section>
      </div>
    </main>
  );
}
