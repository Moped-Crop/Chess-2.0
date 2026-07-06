/**
 * Человеко-читаемые подписи фигур для UI (русские сокращения и названия).
 * Код фигуры (PieceType) → короткая метка на доске и полное имя в модалках.
 */

import type { PieceType } from '../engine/types';

/** Короткая метка на фишке (2 буквы). */
export const PIECE_LABEL: Record<PieceType, string> = {
  K: 'Кр',
  Q: 'Ф',
  R: 'Л',
  B: 'С',
  N: 'К',
  P: 'П',
  ROO: 'Пх',
  N_OUTRIDER: 'Дз',
  N_HUNTER: 'Лв',
  B_PRELATE: 'Пр',
  B_ZEALOT: 'Рв',
  R_RAM: 'Тр',
  R_ANCHOR: 'Оп',
  ROO_PHOENIX: 'Фн',
};

/** Полное название фигуры/формы. */
export const PIECE_NAME: Record<PieceType, string> = {
  K: 'Король',
  Q: 'Ферзь',
  R: 'Ладья',
  B: 'Слон',
  N: 'Конь',
  P: 'Пешка',
  ROO: 'Петух',
  N_OUTRIDER: 'Дозорный',
  N_HUNTER: 'Ловчий',
  B_PRELATE: 'Прелат',
  B_ZEALOT: 'Ревнитель',
  R_RAM: 'Таран',
  R_ANCHOR: 'Опора',
  ROO_PHOENIX: 'Феникс',
};

/** Английские названия фигур/форм. */
export const PIECE_NAME_EN: Record<PieceType, string> = {
  K: 'King',
  Q: 'Queen',
  R: 'Rook',
  B: 'Bishop',
  N: 'Knight',
  P: 'Pawn',
  ROO: 'Rooster',
  N_OUTRIDER: 'Outrider',
  N_HUNTER: 'Hunter',
  B_PRELATE: 'Prelate',
  B_ZEALOT: 'Zealot',
  R_RAM: 'Ram',
  R_ANCHOR: 'Anchor',
  ROO_PHOENIX: 'Phoenix',
};

/** Подсказка по движению формы — показывается при выборе эволюции. */
export const FORM_HINT: Partial<Record<PieceType, string>> = {
  N_OUTRIDER: 'Конь + шаг по прямой',
  N_HUNTER: 'Конь + шаг по диагонали',
  B_PRELATE: 'Слон + шаг по прямой',
  B_ZEALOT: 'Слон + прыжок на 2 по диагонали',
  R_RAM: 'Ладья + прыжок на 2 по прямой',
  R_ANCHOR: 'Ладья + шаг по диагонали (без взятия)',
  ROO_PHOENIX: 'Может ходить назад; бьёт только вперёд',
};

/** Английские подсказки по движению форм. */
export const FORM_HINT_EN: Partial<Record<PieceType, string>> = {
  N_OUTRIDER: 'Knight + 1 step orthogonally',
  N_HUNTER: 'Knight + 1 step diagonally',
  B_PRELATE: 'Bishop + 1 step orthogonally',
  B_ZEALOT: 'Bishop + 2-square diagonal jump',
  R_RAM: 'Rook + 2-square orthogonal jump',
  R_ANCHOR: 'Rook + 1 diagonal step (no capture)',
  ROO_PHOENIX: 'Can move backward; captures only forward',
};
