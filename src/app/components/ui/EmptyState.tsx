/**
 * Пустое состояние списка: иконка, строка и (необязательно) действие.
 */
import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['ui-empty', className ?? ''].filter(Boolean).join(' ')}>
      {Icon && (
        <span className="ui-empty-icon" aria-hidden>
          <Icon size={28} strokeWidth={1.75} />
        </span>
      )}
      <p className="ui-empty-title">{title}</p>
      {hint && <p className="ui-empty-hint">{hint}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
