import { Link } from 'react-router-dom';
import type { Color } from '../../engine/types';
import { useGameStore } from '../store/gameStore';
import { formatTime } from '../clock/clock';
import { capturedBy, materialScore } from '../material';
import { MiniPiece } from './MiniPiece';
import { useT } from '../i18n';

/**
 * Панель игрока: аватар-фишка, имя, индикатор хода, часы, взятые фигуры.
 * Пропсы displayName/avatarBase64 необязательны: без них поведение прежнее
 * («Белые»/«Чёрные»), с ними — реальные имя и аватар (онлайн-режим).
 * `username` передаётся только там, где за панелью стоит реальный чужой
 * аккаунт — тогда имя становится ссылкой на его профиль. Хотсит, бот,
 * обучение и повтор его не передают, и ссылки там не появляется.
 */
export function PlayerBar({
  color,
  displayName,
  avatarBase64,
  username,
}: {
  color: Color;
  displayName?: string;
  avatarBase64?: string | null;
  username?: string;
}) {
  const t = useT();
  const clock = useGameStore((s) => s.clock);
  const turn = useGameStore((s) => s.game.turn);
  const result = useGameStore((s) => s.game.result);
  const captures = useGameStore((s) => s.captures);

  const active = result === 'ongoing' && turn === color;
  const ms = clock ? (color === 'white' ? clock.whiteMs : clock.blackMs) : null;

  const taken = capturedBy(captures, color);
  const opponent: Color = color === 'white' ? 'black' : 'white';
  const advantage = materialScore(taken) - materialScore(capturedBy(captures, opponent));
  const sorted = [...taken].sort((a, b) => materialScore([b]) - materialScore([a]));

  const name = displayName ?? (color === 'white' ? t('white') : t('black'));

  return (
    <div className={`player ${active ? 'active' : ''}`}>
      <div className="player-main">
        {avatarBase64 ? (
          <img className="avatar player-avatar-img" src={avatarBase64} alt="" width={36} height={36} />
        ) : (
          <span className={`player-avatar ${color}`}>
            <MiniPiece type="K" color={color} size={22} />
          </span>
        )}
        <span className="player-info">
          <span className="player-name">
            {username ? (
              <Link className="player-name-link" to={`/players/${username}`}>
                {name}
              </Link>
            ) : (
              name
            )}
          </span>
          {sorted.length > 0 && (
            <span className="player-captures">
              {sorted.map((p, i) => (
                <MiniPiece key={i} type={p.type} color={p.color} size={16} />
              ))}
              {advantage > 0 && <span className="adv">+{advantage}</span>}
            </span>
          )}
        </span>
        {active && ms === null && <span className="player-turn">{t('toMove')}</span>}
        {ms !== null && (
          <span className={`player-clock ${active ? 'running' : ''} ${ms < 20_000 ? 'low' : ''}`}>
            {formatTime(ms)}
          </span>
        )}
      </div>
    </div>
  );
}
