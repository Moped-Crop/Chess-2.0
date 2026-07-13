import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GameState, Piece } from '../../engine/types';
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

  // Показ кадра: позиция и последний ход меняются, лог и взятия всегда полные.
  useEffect(() => {
    if (!detail || !frames) return;
    const last = idx > 0 ? detail.moves[idx - 1] : null;
    loadReplayFrame({
      game: frames.games[idx],
      moveLog: frames.log,
      captures: frames.caps,
      lastMove: last ? { from: last.from, to: last.to } : null,
    });
    // Своя сторона снизу (как в онлайн-партии); настройка не перезаписывается —
    // exitReplay вернёт сохранённую ориентацию.
    useGameStore.setState({ orientation: detail.myColor });
  }, [detail, frames, idx, loadReplayFrame]);

  // При уходе со страницы — вернуть локальный автосейв.
  useEffect(() => exitReplay, [exitReplay]);

  const total = detail?.moves.length ?? 0;
  const clamp = (v: number) => Math.min(total, Math.max(0, v));

  // Листание клавишами ← → .
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((v) => clamp(v - 1));
      if (e.key === 'ArrowRight') setIdx((v) => clamp(v + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

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
          <b>{detail.players.white.displayName}</b> — <b>{detail.players.black.displayName}</b>
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
            <button className="btn btn-subtle" title={t('replayStart')} disabled={idx === 0} onClick={() => setIdx(0)}>
              ⏮
            </button>
            <button className="btn btn-subtle" title={t('replayPrev')} disabled={idx === 0} onClick={() => setIdx(clamp(idx - 1))}>
              ◀
            </button>
            <span className="replay-counter">
              {idx} / {total}
            </span>
            <button className="btn btn-subtle" title={t('replayNext')} disabled={idx === total} onClick={() => setIdx(clamp(idx + 1))}>
              ▶
            </button>
            <button className="btn btn-subtle" title={t('replayEnd')} disabled={idx === total} onClick={() => setIdx(total)}>
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
