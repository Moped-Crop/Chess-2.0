import { useT } from '../i18n';

/** Единый бренд «Chess 2 · ASCENT»: значок + логотип. Используется в шапке
 *  игры и на страницах входа/меню — логотип везде один и тот же. */
export function Brand({ withSub = true }: { withSub?: boolean }) {
  const t = useT();
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path
            d="M12 2l2.4 4.8L19 5.4l-1.6 4.8L21 13l-4.4 1.6.8 5-5.4-2-5.4 2 .8-5L3 13l3.6-2.8L5 5.4l4.6 1.4z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
      </span>
      <span className="brand-logo">
        Chess&nbsp;2<span className="brand-dot">·</span>ASCENT
      </span>
      {withSub && <span className="brand-sub">{t('subtitle')}</span>}
    </div>
  );
}
