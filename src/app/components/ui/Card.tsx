/**
 * Поверхность-карточка. Может быть кликабельной (ведёт на `to`/`href`) —
 * тогда получает hover-подсветку границы и роль ссылки.
 */
import { type HTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

interface OwnProps {
  /** Внутренние отступы карточки (по умолчанию есть). */
  flush?: boolean;
  /** Hover-подъём и подсветка границы (для кликабельных плиток). */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
  to?: LinkProps['to'];
  href?: string;
}

type CardProps = OwnProps & Omit<HTMLAttributes<HTMLElement>, keyof OwnProps>;

export function Card({
  flush = false,
  interactive = false,
  className,
  children,
  to,
  href,
  ...rest
}: CardProps) {
  const cls = [
    'ui-card',
    flush ? 'ui-card-flush' : '',
    interactive || to != null || href != null ? 'ui-card-interactive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (to != null) {
    return (
      <Link to={to} className={cls} {...(rest as Omit<LinkProps, 'to' | 'className'>)}>
        {children}
      </Link>
    );
  }
  if (href != null) {
    return (
      <a href={href} className={cls} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
