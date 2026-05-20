import { useLocaleStore, type AppLocale } from '../store/localeStore';
import { useT } from '../hooks/useT';

type Props = {
  className?: string;
};

export function LanguageSwitcher({ className = '' }: Props) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocaleEverywhere = useLocaleStore((s) => s.setLocaleEverywhere);

  const pick = (next: AppLocale) => {
    if (next === locale) return;
    setLocaleEverywhere(next);
  };

  const switcherClass = ['lang-switcher', className].filter(Boolean).join(' ');

  return (
    <div
      className={switcherClass}
      role="group"
      aria-label={t('lang.aria')}
      title={t('lang.globalHint')}
    >
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
