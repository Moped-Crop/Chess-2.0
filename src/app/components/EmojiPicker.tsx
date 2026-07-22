import { useEffect, useRef } from 'react';
import { useT, type StrKey } from '../i18n';

/**
 * Небольшой поповер с сеткой эмодзи по категориям. Набор собран вручную
 * (около сотни самых ходовых плюс пара шахматных) — готовая библиотека ради
 * этого раздула бы бандл несоразмерно задаче.
 *
 * Один и тот же компонент работает и как вставка эмодзи в текст сообщения, и
 * как выбор реакции — разница только в обработчике `onPick`.
 */
const GROUPS: Array<{ key: StrKey; emojis: string[] }> = [
  {
    key: 'emojiSmileys',
    emojis: [
      '😀', '😄', '😁', '😆', '😅', '🤣', '😊', '🙂', '😉', '😍',
      '😘', '😋', '😎', '🤩', '🥳', '🤔', '🤨', '😐', '😴', '😮',
      '😢', '😭', '😤', '😡', '🥺', '😱', '🤯', '😇', '🤗', '🙃',
    ],
  },
  {
    key: 'emojiGestures',
    emojis: ['👍', '👎', '👌', '✌️', '🤝', '👏', '🙌', '🙏', '💪', '🤟', '👋', '☝️'],
  },
  {
    key: 'emojiHearts',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💯', '✨', '🎉', '🔥'],
  },
  {
    key: 'emojiChess',
    emojis: ['♟️', '♞', '♜', '♝', '♛', '♚', '🐓', '🏆', '⏱️', '🤝', '🎯', '⚔️'],
  },
];

export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  // Клик мимо и Esc закрывают поповер — обычное поведение таких панелей.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="emoji-picker card" ref={ref} role="dialog" aria-label={t('emojiPickerTitle')}>
      {GROUPS.map((group) => (
        <div className="emoji-group" key={group.key}>
          <span className="emoji-group-title">{t(group.key)}</span>
          <div className="emoji-grid">
            {group.emojis.map((emoji, i) => (
              <button
                key={`${group.key}-${i}`}
                type="button"
                className="emoji-btn"
                onClick={() => onPick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
