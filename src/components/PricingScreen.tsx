import { useState, type ReactNode } from 'react';
import { useBillingStore } from '../store/billingStore';
import { createCheckoutSession } from '../lib/billing';
import { isPro, FREE_LIMITS } from '../types/billing';
import type { Plan } from '../types/billing';
import { PointWordmark } from './PointWordmark';

interface Props {
  userBar?: ReactNode;
  onBack?: () => void;
}

interface PlanCard {
  id: 'free' | 'pro_monthly' | 'pro_yearly';
  title: string;
  price: string;
  priceSub: string;
  features: string[];
  highlighted?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  {
    id: 'free',
    title: 'Free',
    price: '$0',
    priceSub: 'Forever free',
    features: [
      '5분 발표 / 세션',
      '월 3 세션',
      '실시간 음성·제스처 코칭',
      'Q&A 1라운드',
      '리포트 7일 보관',
    ],
  },
  {
    id: 'pro_monthly',
    title: 'Pro',
    price: '$9.99',
    priceSub: 'per month',
    highlighted: true,
    features: [
      '무제한 발표 시간',
      '무제한 세션',
      '실시간 음성·제스처 코칭',
      'Q&A 3~5라운드',
      '리포트 영구 보관',
      '코치 voice override',
    ],
  },
  {
    id: 'pro_yearly',
    title: 'Pro Yearly',
    price: '$79',
    priceSub: 'per year · 2개월 할인',
    features: [
      'Pro의 모든 기능',
      '연간 결제로 약 17% 할인',
      '월 환산 ≈ $6.6',
    ],
  },
];

export function PricingScreen({ userBar, onBack }: Props) {
  const subscription = useBillingStore((s) => s.subscription);
  const [busyPlan, setBusyPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan: Plan = subscription?.plan ?? 'free';
  const userIsPro = isPro(subscription);

  const handleSelect = async (plan: PlanCard['id']) => {
    setError(null);
    if (plan === 'free') return;
    if (plan === currentPlan && userIsPro) return;
    setBusyPlan(plan);
    try {
      const url = await createCheckoutSession(plan);
      if (!url) {
        setError('결제 페이지를 열 수 없어요. 잠시 후 다시 시도해주세요.');
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
        <nav className="home-topnav" aria-label="Pricing navigation">
          <div className="home-topnav-brand">
            <PointWordmark
              onHomeClick={onBack}
              ariaLabel="Point — Back"
              className="home-topnav-wordmark"
            />
          </div>
          <div className="home-topnav-links">
            {onBack && (
              <button type="button" className="home-topnav-link" onClick={onBack}>
                ← Back
              </button>
            )}
            {userBar}
          </div>
        </nav>

        <section className="pricing-section">
          <div className="pricing-inner">
            <p className="home-persona-eyebrow">Pricing</p>
            <h1 className="home-persona-heading">Choose your plan</h1>
            <p className="home-persona-lead">
              Free로 시작해서 발표를 더 길게 연습하고 싶을 때 Pro로 업그레이드하세요.
              {' '}Free는 세션당 {FREE_LIMITS.maxDurationSec / 60}분, 월 {FREE_LIMITS.monthlySessions}회까지 제공돼요.
            </p>

            {error && <div className="pricing-error" role="alert">{error}</div>}

            <div className="pricing-cards">
              {PLAN_CARDS.map((card) => {
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
                    {card.highlighted && <span className="pricing-card-badge">Recommended</span>}
                    <h2 className="pricing-card-title">{card.title}</h2>
                    <div className="pricing-card-price">
                      <span className="pricing-card-price-num">{card.price}</span>
                      <span className="pricing-card-price-sub">{card.priceSub}</span>
                    </div>
                    <ul className="pricing-card-features">
                      {card.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={[
                        'pricing-card-cta',
                        card.highlighted ? 'pricing-card-cta--primary' : '',
                      ].filter(Boolean).join(' ')}
                      disabled={isCurrent || isBusy || card.id === 'free'}
                      onClick={() => handleSelect(card.id)}
                    >
                      {isCurrent
                        ? 'Current plan'
                        : card.id === 'free'
                        ? 'Free forever'
                        : isBusy
                        ? 'Loading…'
                        : userIsPro
                        ? 'Switch'
                        : 'Upgrade'}
                    </button>
                  </article>
                );
              })}
            </div>

            <p className="pricing-note">
              결제는 Stripe Checkout으로 안전하게 처리됩니다. 언제든 취소 가능하며, 다음 결제일까지는 Pro 기능이 유지돼요.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
