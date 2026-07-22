/**
 * Модалка с фокус-трапом, закрытием по Esc и клику по подложке. Использует
 * общие классы .overlay/.modal, добавляя доступность (role/aria-modal) и
 * крестик закрытия.
 */
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  onClose,
  title,
  children,
  footer,
  className,
  closeLabel = 'Закрыть',
  showClose = true,
}: {
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  closeLabel?: string;
  showClose?: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const node = panelRef.current;
    const focusables = () =>
      node
        ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => el.offsetParent !== null,
          )
        : [];
    (focusables()[0] ?? node)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={['modal', className ?? ''].filter(Boolean).join(' ')}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {showClose && (
          <button type="button" className="ui-modal-close" onClick={onClose} aria-label={closeLabel}>
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {title && (
          <h3 id={titleId} className="ui-modal-title">
            {title}
          </h3>
        )}
        {children}
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
