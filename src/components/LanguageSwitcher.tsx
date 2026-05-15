import { useLocaleStore, type AppLocale } from '../store/localeStore';
import { useT } from '../hooks/useT';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useT();

  const pick = (next: AppLocale) => {
    if (next !== locale) setLocale(next);
  };

  return (
    <div className={`lang-switcher ${className}`.trim()} role="group" aria-label={t('lang.aria')}>
      <button
        type="button"
        className={`lang-switcher-btn${locale === 'en' ? ' lang-switcher-btn--active' : ''}`}
        onClick={() => pick('en')}
        aria-pressed={locale === 'en'}
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        className={`lang-switcher-btn${locale === 'ko' ? ' lang-switcher-btn--active' : ''}`}
        onClick={() => pick('ko')}
        aria-pressed={locale === 'ko'}
      >
        {t('lang.ko')}
      </button>
    </div>
  );
}
