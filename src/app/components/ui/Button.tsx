/**
 * Единая кнопка проекта. Плоская заливка, без градиентов и цветных теней.
 * Ссылки-кнопки не подчёркиваются: при `to` рендерит react-router <Link>,
 * при `href` — <a>, иначе <button type="button">.
 */
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2, type LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const ICON_SIZE: Record<Size, number> = { sm: 16, md: 18, lg: 20 };

interface OwnProps {
  variant?: Variant;
  size?: Size;
  /** Иконка слева от текста. */
  icon?: LucideIcon;
  /** Спиннер вместо иконки, кнопка становится неактивной. */
  loading?: boolean;
  /** Растянуть на всю ширину контейнера. */
  block?: boolean;
  /** Только для variant="danger": залить красным (финальное подтверждение). */
  solid?: boolean;
  className?: string;
  children?: ReactNode;
  /** Внутренняя навигация — рендерит <Link>. */
  to?: LinkProps['to'];
  /** Внешняя ссылка — рендерит <a>. */
  href?: string;
}

type ButtonProps = OwnProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement> & AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof OwnProps
  >;

export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  block = false,
  solid = false,
  className,
  children,
  to,
  href,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = [
    'ui-btn',
    `ui-btn-${variant}`,
    `ui-btn-${size}`,
    variant === 'danger' && solid ? 'ui-btn-danger-solid' : '',
    block ? 'ui-btn-block' : '',
    children == null ? 'ui-btn-icononly' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const sz = ICON_SIZE[size];
  const inner = (
    <>
      {loading ? (
        <Loader2 className="ui-btn-spin" size={sz} strokeWidth={1.75} aria-hidden />
      ) : (
        Icon && <Icon size={sz} strokeWidth={1.75} aria-hidden />
      )}
      {children != null && <span className="ui-btn-label">{children}</span>}
    </>
  );

  const isDisabled = disabled || loading;

  if (to != null) {
    return (
      <Link
        to={to}
        className={cls}
        aria-disabled={isDisabled || undefined}
        {...(rest as Omit<LinkProps, 'to' | 'className'>)}
      >
        {inner}
      </Link>
    );
  }

  if (href != null) {
    return (
      <a
        href={href}
        className={cls}
        aria-disabled={isDisabled || undefined}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      disabled={isDisabled}
    >
      {inner}
    </button>
  );
}
