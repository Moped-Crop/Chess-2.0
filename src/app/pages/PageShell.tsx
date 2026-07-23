import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '../components/Brand';
import { Button } from '../components/ui';
import { useT } from '../i18n';

/** Каркас внутренних страниц (профиль, друзья): бренд + возврат в меню. */
export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="menu-page">
      <header className="topbar menu-topbar">
        <Brand />
        <div className="topbar-actions">
          <Button variant="secondary" size="sm" icon={ArrowLeft} to="/menu">
            {t('menuBack')}
          </Button>
        </div>
      </header>
      <h2 className="page-title">{title}</h2>
      {children}
    </div>
  );
}
