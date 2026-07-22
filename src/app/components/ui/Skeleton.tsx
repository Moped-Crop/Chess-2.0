/**
 * Заглушка-скелетон под геометрию будущего контента. Задавай те же размеры,
 * что у реального элемента, чтобы при загрузке ничего не сдвигалось.
 */
export function Skeleton({
  w,
  h = 16,
  radius = 'var(--radius-sm)',
  className,
  circle = false,
}: {
  /** Ширина: число (px) или CSS-строка. По умолчанию 100%. */
  w?: number | string;
  /** Высота: число (px) или CSS-строка. */
  h?: number | string;
  radius?: number | string;
  className?: string;
  circle?: boolean;
}) {
  const size = (v: number | string) => (typeof v === 'number' ? `${v}px` : v);
  return (
    <span
      className={['ui-skeleton', className ?? ''].filter(Boolean).join(' ')}
      style={{
        width: w != null ? size(w) : '100%',
        height: size(h),
        borderRadius: circle ? '50%' : size(radius),
      }}
      aria-hidden
    />
  );
}
