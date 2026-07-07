import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Color, GameResult, Move } from '../../engine/types';
import { Board } from '../components/Board';
import { PlayerBar } from '../components/PlayerBar';
import { StatusBanner } from '../components/StatusBanner';
import { MovesTab } from '../components/tabs/MovesTab';
import { EvolutionModal } from '../components/EvolutionModal';
import { GameOverModal } from '../components/GameOverModal';
import { Brand } from '../components/Brand';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { connectSocket } from '../net/socket';
import { useT } from '../i18n';

interface PlayerInfo {
  username: string;
  displayName: string;
  avatarBase64: string | null;
}

interface GameStatePayload {
  gameId: number;
  myColor: Color;
  status: string;
  result: GameResult;
  moves: Move[];
  players: { white: PlayerInfo; black: PlayerInfo };
}

type Conn = 'joining' | 'ok' | 'opponent-away' | 'reconnecting';

/**
 * Онлайн-партия: переиспользует доску, панели и модалки локального режима —
 * стор просто работает в mode='online'. Страница отвечает за сокет-события
 * и баннеры состояния соединения.
 */
export function OnlineGamePage() {
  const { gameId } = useParams();
  const id = Number(gameId);
  const t = useT();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const startOnlineGame = useGameStore((s) => s.startOnlineGame);
  const applyRemoteMove = useGameStore((s) => s.applyRemoteMove);
  const finishOnlineGame = useGameStore((s) => s.finishOnlineGame);
  const leaveOnlineGame = useGameStore((s) => s.leaveOnlineGame);
  const myColor = useGameStore((s) => s.myColor);
  const result = useGameStore((s) => s.game.result);

  const [players, setPlayers] = useState<GameStatePayload['players'] | null>(null);
  const [conn, setConn] = useState<Conn>('joining');
  const [confirmResign, setConfirmResign] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) {
      navigate('/menu', { replace: true });
      return;
    }
    const s = connectSocket();

    // Синхронизация с сервером: повторяем join-game, пока не придёт
    // game-state (закрывает гонки подключения и потерянные пакеты);
    // после реконнекта — синхронизируемся заново.
    let synced = false;
    const trySync = () => {
      if (!synced) s.emit('join-game', { gameId: id });
    };
    const syncTimer = window.setInterval(trySync, 1500);

    const onState = (p: GameStatePayload) => {
      if (p.gameId !== id) return;
      synced = true;
      setPlayers(p.players);
      setWaiting(p.status === 'waiting');
      const oppColor: Color = p.myColor === 'white' ? 'black' : 'white';
      startOnlineGame({
        gameId: id,
        myColor: p.myColor,
        opponent: {
          displayName: p.players[oppColor].displayName,
          avatarBase64: p.players[oppColor].avatarBase64,
        },
        moves: p.moves,
        result: p.status === 'finished' ? p.result : 'ongoing',
      });
      setConn('ok');
    };
    const onMove = (p: { gameId: number; move: Move }) => {
      if (p.gameId === id) applyRemoteMove(p.move);
    };
    const onRejected = (p: { gameId: number }) => {
      // Рассинхрон: перезапрашиваем состояние, стор проиграет партию заново.
      if (p.gameId !== id) return;
      synced = false;
      trySync();
    };
    const onOver = (p: { gameId: number; result: GameResult; reason: string }) => {
      if (p.gameId !== id) return;
      finishOnlineGame(
        p.result,
        p.reason === 'resign' ? 'resign' : p.reason === 'abandon' ? 'abandon' : 'game',
      );
    };
    const onInviteAccepted = (p: { gameId: number }) => {
      // Соперник принял приглашение — партия стала активной.
      if (p.gameId !== id) return;
      synced = false;
      trySync();
    };
    const onOppAway = (p: { gameId: number }) => {
      if (p.gameId === id) setConn('opponent-away');
    };
    const onOppBack = (p: { gameId: number }) => {
      if (p.gameId === id) setConn('ok');
    };
    const onDisconnect = () => setConn('reconnecting');
    const onConnect = () => {
      synced = false;
      trySync();
    };
    const onError = (p: { gameId: number }) => {
      if (p.gameId === id) navigate('/menu', { replace: true });
    };

    s.on('game-state', onState);
    s.on('move', onMove);
    s.on('move-rejected', onRejected);
    s.on('game-over', onOver);
    s.on('invite-accepted', onInviteAccepted);
    s.on('opponent-disconnected', onOppAway);
    s.on('opponent-reconnected', onOppBack);
    s.on('disconnect', onDisconnect);
    s.on('connect', onConnect);
    s.on('game-error', onError);
    trySync(); // до подключения socket.io буферизует emit — безопасно всегда

    return () => {
      window.clearInterval(syncTimer);
      s.off('game-state', onState);
      s.off('move', onMove);
      s.off('move-rejected', onRejected);
      s.off('game-over', onOver);
      s.off('invite-accepted', onInviteAccepted);
      s.off('opponent-disconnected', onOppAway);
      s.off('opponent-reconnected', onOppBack);
      s.off('disconnect', onDisconnect);
      s.off('connect', onConnect);
      s.off('game-error', onError);
      leaveOnlineGame();
    };
    // Методы стора стабильны (zustand); ре-подписка — только при смене партии.
  }, [id, navigate, startOnlineGame, applyRemoteMove, finishOnlineGame, leaveOnlineGame]);

  const oppColor: Color = myColor === 'white' ? 'black' : 'white';
  const me = players && myColor ? players[myColor] : null;
  const opp = players && myColor ? players[oppColor] : null;

  function resign() {
    if (!confirmResign) {
      setConfirmResign(true);
      window.setTimeout(() => setConfirmResign(false), 4000);
      return;
    }
    setConfirmResign(false);
    connectSocket().emit('resign', { gameId: id });
  }

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="btn btn-ghost" to="/menu">
            ← {t('menuBack')}
          </Link>
        </div>
      </header>

      {conn !== 'ok' && (
        <div className={`conn-banner ${conn === 'opponent-away' ? 'warn' : ''}`}>
          {conn === 'joining' && t('loading')}
          {conn === 'reconnecting' && t('connReconnecting')}
          {conn === 'opponent-away' && t('connOpponentAway')}
        </div>
      )}
      {waiting && conn === 'ok' && <div className="conn-banner">{t('waitingOpponent')}</div>}

      <div className="main">
        <div className="board-col">
          <PlayerBar
            color={oppColor}
            displayName={opp?.displayName}
            avatarBase64={opp?.avatarBase64}
          />
          <div className="card board-card">
            <Board />
          </div>
          <PlayerBar
            color={myColor ?? 'white'}
            displayName={me?.displayName ?? user?.displayName}
            avatarBase64={me?.avatarBase64 ?? user?.avatarBase64}
          />
        </div>

        <aside className="sidebar">
          <div className="card sidebar-card">
            <StatusBanner />
            {result === 'ongoing' && (
              <button
                className={`btn btn-block ${confirmResign ? 'btn-danger' : 'btn-subtle'}`}
                onClick={resign}
              >
                {confirmResign ? t('resignConfirm') : t('resignBtn')}
              </button>
            )}
            <div className="section-divider" />
            <MovesTab />
          </div>
        </aside>
      </div>

      <EvolutionModal />
      <GameOverModal />
    </div>
  );
}
