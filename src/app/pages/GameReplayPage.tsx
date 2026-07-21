import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Color, GameState, Piece } from '../../engine/types';
import {
  createInitialState,
  applyMove,
  computeResult,
  isKingInCheck,
  legalMoves,
} from '../../engine';
import { moveSan, type MoveEntry } from '../notation';
import { Board } from '../components/Board';
import { MovesTab } from '../components/tabs/MovesTab';
import { Brand } from '../components/Brand';
import { useGameStore } from '../store/gameStore';
import { apiGameDetail, type GameDetail } from '../api/games';
import { presetById } from '../clock/clock';
import { useT, useLang } from '../i18n';

interface Frames {
  games: GameState[];
  log: MoveEntry[];
  caps: (Piece | null)[];
}

/**
 * Повтор завершённой онлайн-партии: доска в mode='replay' (клики не работают),
 * листание ходов кнопками и стрелками ← →. Партия неизменна — обычный REST,
 * без сокета.
 */
export function GameReplayPage() {
  const { gameId } = useParams();
  const id = Number(gameId);
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();

  const loadReplayFrame = useGameStore((s) => s.loadReplayFrame);
  const stepReplayForward = useGameStore((s) => s.stepReplayForward);
  const stepReplayBackward = useGameStore((s) => s.stepReplayBackward);
  const exitReplay = useGameStore((s) => s.exitReplay);

  const [detail, setDetail] = useState<GameDetail | null>(null);
  const [idx, setIdx] = useState(0);

  // Загрузка партии; чужая/несуществующая — назад в список истории.
  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      navigate('/history', { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiGameDetail(id);
        if (cancelled) return;
        setDetail(d);
        setIdx(d.moves.length); // по умолчанию — финальная позиция
      } catch {
        if (!cancelled) navigate('/history', { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // Все позиции партии считаются один раз — той же логикой, что startOnlineGame.
  const frames = useMemo<Frames | null>(() => {
    if (!detail) return null;
    let g = createInitialState();
    const games: GameState[] = [g];
    const log: MoveEntry[] = [];
    const caps: (Piece | null)[] = [];
    for (const m of detail.moves) {
      const mover = g.board[m.from];
      caps.push(m.capture !== undefined ? g.board[m.capture] : null);
      const applied = applyMove(g, m);
      g = { ...applied, result: computeResult(applied) };
      log.push({
        color: mover?.color ?? 'white',
        pieceType: mover ? mover.type : 'P',
        san: moveSan(m, g),
      });
      games.push(g);
    }
    // Итог из БД: сдачу/тайм-аут по одним ходам не восстановить.
    if (detail.result && detail.result !== 'ongoing') {
      games[games.length - 1] = { ...games[games.length - 1], result: detail.result };
    }
    return { games, log, caps };
  }, [detail]);

  const total = detail?.moves.length ?? 0;

  const lastOf = (i: number) =>
    detail && i > 0 ? { from: detail.moves[i - 1].from, to: detail.moves[i - 1].to } : null;

  // Первичная загрузка: финальная позиция целиком (лог и взятия всегда полные).
  useEffect(() => {
    if (!detail || !frames) return;
    loadReplayFrame({
      game: frames.games[detail.moves.length],
      moveLog: frames.log,
      captures: frames.caps,
      lastMove:
        detail.moves.length > 0
          ? {
              from: detail.moves[detail.moves.length - 1].from,
              to: detail.moves[detail.moves.length - 1].to,
            }
          : null,
    });
    // Своя сторона снизу (как в онлайн-партии); настройка не перезаписывается —
    // exitReplay вернёт сохранённую ориентацию.
    useGameStore.setState({ orientation: detail.myColor });
  }, [detail, frames, loadReplayFrame]);

  // При уходе со страницы — вернуть локальный автосейв.
  useEffect(() => exitReplay, [exitReplay]);

  // Одиночный шаг — через stepReplay* (честный переход с анимацией, A5);
  // прыжок в начало/конец — мгновенно через loadReplayFrame, это осознанно.
  function goForward() {
    if (!detail || !frames || idx >= total) return;
    stepReplayForward(detail.moves[idx]);
    setIdx(idx + 1);
  }

  function goBackward() {
    if (!detail || !frames || idx === 0) return;
    stepReplayBackward({
      game: frames.games[idx - 1],
      lastMove: lastOf(idx - 1),
      undone: detail.moves[idx - 1],
    });
    setIdx(idx - 1);
  }

  function jumpTo(i: number) {
    if (!detail || !frames) return;
    loadReplayFrame({
      game: frames.games[i],
      moveLog: frames.log,
      captures: frames.caps,
      lastMove: lastOf(i),
    });
    setIdx(i);
  }

  // Листание клавишами ← → .
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBackward();
      if (e.key === 'ArrowRight') goForward();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!detail || !frames) {
    return (
      <div className="app">
        <header className="topbar">
          <Brand />
        </header>
        <p className="page-loader">{t('loading')}</p>
      </div>
    );
  }

  const finalGame = frames.games[frames.games.length - 1];
  const resultTitle =
    detail.result === 'white'
      ? t('whiteWins')
      : detail.result === 'black'
        ? t('blackWins')
        : t('draw');

  let reasonText = '';
  if (detail.winReason === 'resign') reasonText = t('reasonResign');
  else if (detail.winReason === 'abandon') reasonText = t('reasonAbandon');
  else if (detail.winReason === 'timeout') reasonText = t('reasonTimeout');
  else if (detail.result === 'draw') reasonText = t('reasonDraw');
  else if (detail.winReason === 'game') {
    // Та же эвристика, что в GameOverModal: проигравший — под шахом без ходов.
    const mate = isKingInCheck(finalGame.board, finalGame.turn) && legalMoves(finalGame).length === 0;
    reasonText = mate ? t('reasonMate') : '';
  }

  // Имя соперника ведёт на его профиль — задел под матчмейкинг, где сыгранная
  // партия может быть единственной ниточкой к незнакомому игроку. Своё имя
  // остаётся простым текстом.
  const oppColor: Color = detail.myColor === 'white' ? 'black' : 'white';
  const players = detail.players;

  function playerName(color: Color) {
    const p = players[color];
    if (color !== oppColor) return p.displayName;
    return (
      <Link className="replay-player-link" to={`/players/${p.username}`}>
        {p.displayName}
      </Link>
    );
  }

  const tc = detail.timeControlId ? presetById(detail.timeControlId) : null;
  const dateText = detail.finishedAt
    ? new Date(detail.finishedAt).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/history">
            ← {t('historyTitle')}
          </Link>
        </div>
      </header>

      <div className="replay-info card">
        <span className="replay-players">
          <b>{playerName('white')}</b> — <b>{playerName('black')}</b>
        </span>
        <span className="replay-result">
          {resultTitle}
          {reasonText && <span className="replay-reason"> · {reasonText}</span>}
        </span>
        <span className="replay-meta">
          {tc && <span>{lang === 'en' ? tc.labelEn : tc.label}</span>}
          {dateText && <span>{dateText}</span>}
        </span>
      </div>

      <div className="main">
        <div className="board-col">
          <div className="card board-card">
            <Board />
          </div>
          <div className="replay-controls">
            <button className="btn btn-subtle" title={t('replayStart')} disabled={idx === 0} onClick={() => jumpTo(0)}>
              ⏮
            </button>
            <button className="btn btn-subtle" title={t('replayPrev')} disabled={idx === 0} onClick={goBackward}>
              ◀
            </button>
            <span className="replay-counter">
              {idx} / {total}
            </span>
            <button className="btn btn-subtle" title={t('replayNext')} disabled={idx === total} onClick={goForward}>
              ▶
            </button>
            <button className="btn btn-subtle" title={t('replayEnd')} disabled={idx === total} onClick={() => jumpTo(total)}>
              ⏭
            </button>
          </div>
        </div>

        <aside className="sidebar">
          <div className="card sidebar-card">
            <MovesTab />
          </div>
        </aside>
      </div>
    </div>
  );
}
