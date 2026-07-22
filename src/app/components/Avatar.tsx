/**
 * Аватар-кружок. Картинка тянется по userId из ручки `/api/avatars/:id`
 * (кешируется браузером), при ошибке/отсутствии — инициал имени.
 *
 * Для ТЕКУЩЕГО пользователя можно передать `src` (его data-URL уже в памяти
 * после /me) — тогда своя аватарка показывается мгновенно и всегда свежая
 * (сразу после смены), без запроса к ручке.
 *
 * Ширина/высота заданы явно, чтобы догрузка картинки НЕ сдвигала вёрстку.
 */
import { useState } from 'react';

export function Avatar({
  userId,
  name,
  size = 40,
  src,
}: {
  userId?: number | null;
  name: string;
  size?: number;
  /** Прямой data-URL (обычно свой аватар) — в приоритете над ручкой. */
  src?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const imgSrc = src ?? (userId != null ? `/api/avatars/${userId}` : null);

  if (imgSrc && !failed) {
    return (
      <img
        className="avatar"
        src={imgSrc}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className="avatar avatar-letter"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
