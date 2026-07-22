/**
 * Сегментированный переключатель (вкладки, выбор цвета, RU/EN). Рендерит
 * знакомую разметку `.segmented`, дополняя её ролями и клавиатурой.
 */
import { type LucideIcon } from 'lucide-react';

export interface SegOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  /** Число справа от подписи (например, входящих заявок). */
  badge?: number;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  block = false,
  ariaLabel,
  className,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  block?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const cls = [
    'segmented',
    block ? 'segmented-block' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            className={active ? 'active' : ''}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden />}
            {opt.label}
            {opt.badge != null && opt.badge > 0 && (
              <span className="seg-badge">{opt.badge > 99 ? '99+' : opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
