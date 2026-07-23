/**
 * Карточка игрока: аватар, имя, бейдж рейтинга/ранга и полоска прогресса до
 * следующего ранга. Одна на меню (кликабельна, ведёт в профиль) и на экран
 * рейтингового поиска. Пока рейтинг не загружен (`rating == null`) — скелетоны
 * той же высоты, чтобы карточка не «прыгала».
 */
import { Avatar } from './Avatar';
import { RatingBadge, RankProgressBar } from './RatingBadge';
import { Card, Skeleton } from './ui';

export function PlayerRatingCard({
  userId,
  displayName,
  username,
  avatarSrc,
  rating,
  to,
  ariaLabel,
}: {
  userId: number;
  displayName: string;
  username: string;
  /** Свой data-URL аватара (мгновенно), иначе тянется по userId. */
  avatarSrc?: string | null;
  /** null — данные ещё грузятся (показываем скелетон). */
  rating: number | null;
  /** Задан — карточка кликабельна и ведёт сюда. */
  to?: string;
  ariaLabel?: string;
}) {
  return (
    <Card to={to} interactive={to != null} aria-label={ariaLabel} className="player-rating-card">
      <div className="prc-top">
        <Avatar src={avatarSrc} userId={userId} name={displayName} size={56} />
        <div className="prc-id">
          <span className="prc-name">{displayName}</span>
          <span className="prc-username">@{username}</span>
          {rating == null ? (
            <Skeleton w={150} h={22} radius="999px" className="prc-skel" />
          ) : (
            <RatingBadge rating={rating} size="lg" />
          )}
        </div>
      </div>
      {rating == null ? (
        <Skeleton h={8} radius="999px" className="prc-skel-bar" />
      ) : (
        <RankProgressBar rating={rating} />
      )}
    </Card>
  );
}
