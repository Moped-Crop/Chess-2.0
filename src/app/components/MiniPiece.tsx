import type { Color, PieceType } from '../../engine/types';
import { PieceView } from './Piece';

/**
 * Маленькая иконка фигуры (переиспользует отрисовку доски) для истории,
 * взятий и панелей выбора. Эволюционные формы автоматически получают свою
 * модельку — графика определяется типом фигуры.
 */
export function MiniPiece({
  type,
  color,
  size = 22,
}: {
  type: PieceType;
  color: Color;
  size?: number;
}) {
  const piece = { type, color, hasMoved: true, evolved: false };
  return (
    <svg viewBox="0 0 30 30" width={size} height={size} style={{ display: 'block', flex: '0 0 auto' }}>
      <PieceView piece={piece} x={0} y={0} size={30} />
    </svg>
  );
}
