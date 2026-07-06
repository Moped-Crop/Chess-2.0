/**
 * Перевод клетки доски в пиксельные координаты SVG с учётом разворота.
 * flipped=false — белые внизу (ранг 0 в нижней строке, файл a слева).
 * flipped=true  — поворот на 180°: чёрные внизу (ранг и файл инвертированы).
 */

import { fileOf, rankOf, FILE_COUNT, RANK_COUNT } from '../engine/board';
import type { Square } from '../engine/types';

export function squareToXY(s: Square, flipped: boolean, cell: number): { x: number; y: number } {
  const f = fileOf(s);
  const r = rankOf(s);
  const col = flipped ? FILE_COUNT - 1 - f : f;
  const row = flipped ? r : RANK_COUNT - 1 - r;
  return { x: col * cell, y: row * cell };
}
