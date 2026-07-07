import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { useT } from '../i18n';

/** Каркас внутренних страниц (профиль, друзья): бренд + возврат в меню. */
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="menu-page">
      <header className="topbar menu-topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="btn btn-subtle" to="/menu">
            ← {t('menuBack')}
          </Link>
        </div>
      </header>
      <h2 className="page-title">{title}</h2>
      {children}
    </div>
  );
}
