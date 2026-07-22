/**
 * Компактная метка: тип партии («рейтинговая»/«обычная»), статус, тег.
 * Для рейтинга/ранга есть отдельный RatingBadge — здесь общий примитив.
 */
import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

type Tone = 'neutral' | 'accent' | 'success' | 'danger' | 'gold';

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  const cls = ['ui-badge', `ui-badge-${tone}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {Icon && <Icon size={13} strokeWidth={1.75} aria-hidden />}
      {children}
    </span>
  );
}
