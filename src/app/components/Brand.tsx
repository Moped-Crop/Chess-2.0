/** Единый бренд «Chess 2 · ASCENT»: значок + логотип. Используется в шапке
 *  игры и на страницах входа/меню — логотип везде один и тот же.
 *
 *  Знак — три восходящих пика: петушиный гребень (фирменная фигура — Петух)
 *  и одновременно восхождение (ASCENT). Плоский, один цвет, читается на
 *  24–32px. */
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path
            d="M3 19.5 L6.2 11.5 L8.6 14.9 L11.4 6.6 L13.8 10.5 L17.2 2.9 L21 19.5 Z"
            fill="currentColor"
            opacity="0.95"
          />
        </svg>
      </span>
      <span className="brand-logo">
        Chess&nbsp;2<span className="brand-dot">·</span>ASCENT
      </span>
    </div>
  );
}
