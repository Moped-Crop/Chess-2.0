/**
 * ВРЕМЕННАЯ демо-страница UI-примитивов (/ui-kit). Нужна для чекпоинта 2,
 * удаляется в конце фазы. В обычной навигации на неё ссылок нет.
 */
import { useState } from 'react';
import {
  Swords,
  Users,
  Crown,
  Trophy,
  History,
  MessageSquare,
  Search,
  Send,
  Settings,
  Bot,
  Inbox,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import {
  Button,
  Card,
  Badge,
  Field,
  Modal,
  Skeleton,
  EmptyState,
  SegmentedControl,
  type SegOption,
} from '../components/ui';

type Tab = 'friends' | 'requests';
const TABS: SegOption<Tab>[] = [
  { value: 'friends', label: 'Друзья', icon: Users },
  { value: 'requests', label: 'Заявки', icon: Inbox, badge: 3 },
];

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {children}
    </div>
  );
}

export function UiKitPage() {
  const uiTheme = useGameStore((s) => s.uiTheme);
  const setUiTheme = useGameStore((s) => s.setUiTheme);
  const [tab, setTab] = useState<Tab>('friends');
  const [modal, setModal] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="app" style={{ maxWidth: 1100 }}>
      <header
        className="topbar"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1 className="h-display" style={{ fontSize: 'var(--fs-2xl)', margin: 0 }}>
          UI Kit
        </h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
        >
          Тема: {uiTheme}
        </Button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
        {/* Buttons */}
        <section>
          <h2 className="section-title">Кнопки — варианты</h2>
          <Row>
            <Button variant="primary" icon={Search}>
              Найти соперника
            </Button>
            <Button variant="secondary" icon={History}>
              История партий
            </Button>
            <Button variant="ghost" icon={Settings}>
              Настройки
            </Button>
            <Button variant="danger">Удалить</Button>
            <Button variant="danger" solid>
              Удалить навсегда
            </Button>
          </Row>
          <h2 className="section-title" style={{ marginTop: 'var(--sp-5)' }}>
            Размеры · состояния
          </h2>
          <Row>
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="md" variant="primary">
              Medium
            </Button>
            <Button size="lg" variant="primary" icon={Swords}>
              Large
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button
              variant="primary"
              loading={loading}
              onClick={() => {
                setLoading(true);
                window.setTimeout(() => setLoading(false), 1500);
              }}
            >
              {loading ? 'Отправка' : 'Нажми — спиннер'}
            </Button>
          </Row>
          <h2 className="section-title" style={{ marginTop: 'var(--sp-5)' }}>
            Иконки-кнопки (ghost 36–44) · ссылки-кнопки
          </h2>
          <Row>
            <Button variant="ghost" size="sm" icon={MessageSquare} aria-label="Написать" />
            <Button variant="ghost" size="sm" icon={Swords} aria-label="Пригласить" />
            <Button variant="primary" size="sm" icon={Send} aria-label="Отправить" />
            <Button variant="secondary" to="/menu">
              Ссылка (Link, без подчёркивания)
            </Button>
          </Row>
        </section>

        {/* Cards */}
        <section>
          <h2 className="section-title">Карточки</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card>
              <h3 style={{ marginTop: 0 }}>Обычная карточка</h3>
              <p style={{ color: 'var(--text-dim)', margin: 0 }}>
                Плоская поверхность, нейтральная тень.
              </p>
            </Card>
            <Card interactive to="/menu">
              <h3 style={{ marginTop: 0 }}>Кликабельная карточка</h3>
              <p style={{ color: 'var(--text-dim)', margin: 0 }}>
                Наведите — подсветка границы и подъём на 1px.
              </p>
            </Card>
          </div>
        </section>

        {/* Badges */}
        <section>
          <h2 className="section-title">Бейджи</h2>
          <Row>
            <Badge tone="neutral">обычная</Badge>
            <Badge tone="accent" icon={Swords}>
              рейтинговая
            </Badge>
            <Badge tone="success">Победа</Badge>
            <Badge tone="danger">Поражение</Badge>
            <Badge tone="gold" icon={Trophy}>
              Магистр ASCENT
            </Badge>
          </Row>
        </section>

        {/* SegmentedControl */}
        <section>
          <h2 className="section-title">Сегментированный контрол</h2>
          <SegmentedControl options={TABS} value={tab} onChange={setTab} ariaLabel="Раздел" />
          <p style={{ color: 'var(--text-dim)', marginTop: 8 }}>Выбрано: {tab}</p>
        </section>

        {/* Fields */}
        <section>
          <h2 className="section-title">Поля формы</h2>
          <div style={{ maxWidth: 420 }}>
            <Field label="Логин или email" placeholder="you@example.com" />
            <Field
              label="Пароль"
              type="password"
              error="Неверный пароль. Попробуйте ещё раз."
            />
            <Field
              label="О себе"
              as="textarea"
              placeholder="Пара слов…"
              hint="Необязательно, до 200 символов."
            />
          </div>
        </section>

        {/* Skeleton */}
        <section>
          <h2 className="section-title">Скелетоны</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Skeleton w={40} h={40} circle />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton w="60%" h={14} />
              <Skeleton w="35%" h={12} />
            </div>
            <Skeleton w={86} h={28} radius="999px" />
          </div>
        </section>

        {/* EmptyState */}
        <section>
          <h2 className="section-title">Пустое состояние</h2>
          <Card>
            <EmptyState
              icon={Users}
              title="Пока нет друзей"
              hint="Найдите игрока по нику и отправьте заявку."
              action={
                <Button variant="primary" size="sm" icon={Search}>
                  Найти игрока
                </Button>
              }
            />
          </Card>
        </section>

        {/* Modal */}
        <section>
          <h2 className="section-title">Модалка</h2>
          <Button variant="secondary" icon={Crown} onClick={() => setModal(true)}>
            Открыть модалку
          </Button>
          {modal && (
            <Modal
              title="Заголовок модалки"
              onClose={() => setModal(false)}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModal(false)}>
                    Отмена
                  </Button>
                  <Button variant="primary" icon={Bot} onClick={() => setModal(false)}>
                    Понятно
                  </Button>
                </>
              }
            >
              <p style={{ color: 'var(--text-dim)' }}>
                Закрывается по Esc, клику по подложке и крестику. Фокус заперт внутри.
              </p>
            </Modal>
          )}
        </section>
      </div>
    </div>
  );
}
