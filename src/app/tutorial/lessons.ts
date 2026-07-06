/**
 * Раздел «Как играть» — интерактивные уроки-сцены.
 *
 * Каждый урок = стартовая позиция + сценарий (script) из шагов, которые
 * проигрывает LessonPlayer (TutorialBoard.tsx): подсветки, стрелки, плашки-
 * пояснения, настоящие ходы с анимацией, панели выбора, эффекты эволюции,
 * шаха и мата. Все демонстрации соответствуют правилам B1–B8.
 *
 * ---------------------------------------------------------------
 * STORYBOARD (сценарии всех уроков)
 *
 *  1. Знакомство. Стартовая расстановка 10×8 → подсветка Петухов d1/g1/d8/g8 →
 *     плашки-пояснения. Конец: подводка к эволюции.
 *  2. Петух: только вперёд. Подсветка вертикали (точки) и запрещённых клеток
 *     (✕) → стрелка e4→e7 → плавный ход → плашка «назад пути нет».
 *  3. Петух: бок и взятие. Точки бокового шага, кольца диагоналей → стрелка →
 *     взятие e4×f5: Петух скользит, пешка растворяется → плашка «Взятие!».
 *  4. Взятие фигуры. Конь d4 бьёт слона e6: кольцо на цели, стрелка, ход,
 *     слон исчезает (fade+scale) → плашка.
 *  5. Зона эволюции. Зелёная зона рядов 6–8 → Конь d4→e6 заканчивает ход в
 *     зоне → плашка-событие «время эволюции».
 *  6. Эволюция: выбор формы. Конь входит в зону → открывается панель выбора
 *     (Дозорный/Ловчий) → выбор → вспышка-трансформация с кольцами →
 *     появляется форма со значком → плашка-событие.
 *  7. Бастион. Стрелки в обе стороны от короля → король f1→h1 и ладья j1→g1
 *     едут ОДНОВРЕМЕННО → плашка «одним ходом».
 *  8. Превращение пешки. Пешка e7→e8 → панель выбора из 5 фигур → выбор
 *     ферзя → эффект появления → плашка «превращение ≠ эволюция».
 *  9. Взятие на проходе. Чёрная пешка d7→d5 двойным ходом → подсветка
 *     «проскоченного» поля d6 → белая пешка e5→d6, чёрная пешка с d5
 *     растворяется → плашка «взятие на проходе».
 * 10. Шах и мат. Ферзь b4→b7 → пульс у короля + плашка «Шах!» → затемнение
 *     доски, золотая подсветка короля, крупная плашка «Мат» — партия окончена.
 * ---------------------------------------------------------------
 */

import type { Color, Piece, PieceType } from '../../engine/types';
import { sq, BOARD_SIZE } from '../../engine/board';
import { createInitialState } from '../../engine';

export type MarkKind = 'zone' | 'move' | 'capture' | 'focus' | 'no';
export interface Mark {
  sq: number;
  kind: MarkKind;
}
export interface Bilingual {
  ru: string;
  en: string;
}

/** Шаг сценария урока. Каждый шаг длится dur мс (иначе — дефолт по типу). */
export type TutStep =
  | { t: 'caption'; text: Bilingual; style?: 'info' | 'event' | 'danger'; dur?: number }
  | { t: 'marks'; marks: Mark[]; dur?: number }
  | { t: 'arrow'; from: number; to: number; dur?: number }
  | { t: 'clear'; dur?: number }
  | {
      t: 'move';
      from: number;
      to: number;
      capture?: number;
      rook?: { from: number; to: number };
      dur?: number;
    }
  | { t: 'panel'; options: PieceType[]; kind: 'evolution' | 'promotion'; dur?: number }
  | { t: 'pick'; index: number; dur?: number }
  | { t: 'transform'; square: number; into: PieceType; dur?: number }
  | { t: 'check'; square: number; dur?: number }
  | { t: 'mate'; square: number; dur?: number }
  | { t: 'pause'; dur: number };

export interface Lesson {
  title: Bilingual;
  text: Bilingual;
  board: (Piece | null)[];
  script: TutStep[];
}

function empty(): (Piece | null)[] {
  return new Array<Piece | null>(BOARD_SIZE).fill(null);
}
function pc(type: PieceType, color: Color, evolved = false): Piece {
  return { type, color, hasMoved: false, evolved };
}
function marksOf(squares: number[], kind: MarkKind): Mark[] {
  return squares.map((s) => ({ sq: s, kind }));
}
function zoneMarks(ranks: number[]): Mark[] {
  const m: Mark[] = [];
  for (const r of ranks) for (let f = 0; f < 10; f++) m.push({ sq: sq(f, r), kind: 'zone' });
  return m;
}

/* ---------- Позиции уроков ---------- */

const roosterForward = empty();
roosterForward[sq(4, 3)] = pc('ROO', 'white');

const roosterCapture = empty();
roosterCapture[sq(4, 3)] = pc('ROO', 'white');
roosterCapture[sq(3, 4)] = pc('P', 'black');
roosterCapture[sq(5, 4)] = pc('P', 'black');

const captureBoard = empty();
captureBoard[sq(3, 3)] = pc('N', 'white');
captureBoard[sq(4, 5)] = pc('B', 'black');

const zoneBoard = empty();
zoneBoard[sq(3, 3)] = pc('N', 'white');

const evoBoard = empty();
evoBoard[sq(3, 3)] = pc('N', 'white');

const castleBoard = empty();
castleBoard[sq(0, 0)] = pc('R', 'white');
castleBoard[sq(9, 0)] = pc('R', 'white');
castleBoard[sq(5, 0)] = pc('K', 'white');

const promoBoard = empty();
promoBoard[sq(4, 6)] = pc('P', 'white');

const epBoard = empty();
epBoard[sq(4, 4)] = pc('P', 'white');
epBoard[sq(3, 6)] = pc('P', 'black');

const mateBoard = empty();
mateBoard[sq(0, 7)] = pc('K', 'black');
mateBoard[sq(1, 3)] = pc('Q', 'white');
mateBoard[sq(2, 5)] = pc('K', 'white');

/* ---------- Уроки ---------- */

export const LESSONS: Lesson[] = [
  // 1. Знакомство
  {
    title: { ru: 'Добро пожаловать в Chess 2', en: 'Welcome to Chess 2' },
    text: {
      ru: 'Это шахматы на доске 10×8 (файлы a–j, ряды 1–8). Все классические фигуры ходят как обычно. Нового — два: фигура Петух и механика Эволюции.',
      en: "It's chess on a 10×8 board (files a–j, ranks 1–8). All classic pieces move as usual. Two things are new: the Rooster piece and the Evolution mechanic.",
    },
    board: createInitialState().board,
    script: [
      {
        t: 'caption',
        text: { ru: 'Доска шире классической: 10×8', en: 'The board is wider than classic: 10×8' },
        dur: 1800,
      },
      {
        t: 'marks',
        marks: marksOf([sq(3, 0), sq(6, 0), sq(3, 7), sq(6, 7)], 'focus'),
        dur: 700,
      },
      {
        t: 'caption',
        text: { ru: 'Новая фигура — Петух (d1 и g1)', en: 'A new piece — the Rooster (d1 and g1)' },
        dur: 2200,
      },
      { t: 'clear', dur: 400 },
      {
        t: 'caption',
        text: {
          ru: 'А ещё фигуры умеют эволюционировать — смотри дальше',
          en: 'Pieces can also evolve — see the next lessons',
        },
        style: 'event',
        dur: 2200,
      },
    ],
  },

  // 2. Петух: только вперёд
  {
    title: { ru: 'Петух: рвётся вперёд', en: 'The Rooster charges forward' },
    text: {
      ru: 'Петух ходит вперёд по вертикали — как ладья, но ТОЛЬКО вперёд. Назад он не ходит совсем. Если впереди стоит фигура, Петух упирается в неё.',
      en: 'The Rooster moves forward along the file — like a rook, but ONLY forward. It never moves backward. If a piece blocks it ahead, the Rooster is stuck.',
    },
    board: roosterForward,
    script: [
      {
        t: 'marks',
        marks: [
          { sq: sq(4, 3), kind: 'focus' },
          ...marksOf([sq(4, 4), sq(4, 5), sq(4, 6), sq(4, 7)], 'move'),
          ...marksOf([sq(4, 2), sq(3, 2), sq(5, 2)], 'no'),
        ],
        dur: 900,
      },
      {
        t: 'caption',
        text: { ru: 'Только вперёд — точки. Назад — нельзя (✕)', en: 'Forward only — dots. Never backward (✕)' },
        dur: 2000,
      },
      { t: 'arrow', from: sq(4, 3), to: sq(4, 6), dur: 700 },
      { t: 'move', from: sq(4, 3), to: sq(4, 6), dur: 900 },
      {
        t: 'caption',
        text: { ru: 'Ход сделан — назад пути нет', en: 'The move is made — there is no way back' },
        dur: 2000,
      },
    ],
  },

  // 3. Петух: бок и взятие
  {
    title: { ru: 'Петух: бок и взятие', en: 'Rooster: sidestep and capture' },
    text: {
      ru: 'Вбок Петух шагает на 1 клетку, но только без взятия — так он обходит преграды ценой темпа. Бьёт он лишь по двум диагоналям-вперёд. Эта необратимость — и фишка, и слабость.',
      en: 'The Rooster steps 1 square sideways, but only without capturing — a way around blockers at the cost of a tempo. It captures only along the two forward diagonals.',
    },
    board: roosterCapture,
    script: [
      {
        t: 'marks',
        marks: [
          { sq: sq(4, 3), kind: 'focus' },
          ...marksOf([sq(3, 3), sq(5, 3)], 'move'),
          ...marksOf([sq(3, 4), sq(5, 4)], 'capture'),
        ],
        dur: 900,
      },
      {
        t: 'caption',
        text: {
          ru: 'Вбок — шаг без взятия. Бьёт — по диагонали вперёд',
          en: 'Sideways — a non-capturing step. Captures — on forward diagonals',
        },
        dur: 2200,
      },
      { t: 'arrow', from: sq(4, 3), to: sq(5, 4), dur: 700 },
      { t: 'move', from: sq(4, 3), to: sq(5, 4), capture: sq(5, 4), dur: 1000 },
      { t: 'caption', text: { ru: 'Взятие!', en: 'Captured!' }, style: 'event', dur: 1800 },
    ],
  },

  // 4. Взятие фигуры
  {
    title: { ru: 'Взятие фигуры', en: 'Capturing a piece' },
    text: {
      ru: 'Взятие — как в классике: фигура занимает клетку противника, а его фигура снимается с доски. Конь ходит буквой «Г» и перепрыгивает через фигуры.',
      en: 'Capturing works as in classic chess: your piece takes the square, the enemy piece leaves the board. The knight moves in an “L” and jumps over pieces.',
    },
    board: captureBoard,
    script: [
      { t: 'marks', marks: [{ sq: sq(3, 3), kind: 'focus' }], dur: 700 },
      {
        t: 'caption',
        text: { ru: 'Конь нацелился на слона…', en: 'The knight eyes the bishop…' },
        dur: 1600,
      },
      { t: 'marks', marks: [{ sq: sq(3, 3), kind: 'focus' }, { sq: sq(4, 5), kind: 'capture' }], dur: 600 },
      { t: 'arrow', from: sq(3, 3), to: sq(4, 5), dur: 700 },
      { t: 'move', from: sq(3, 3), to: sq(4, 5), capture: sq(4, 5), dur: 1000 },
      {
        t: 'caption',
        text: { ru: 'Слон снят с доски', en: 'The bishop is removed from the board' },
        dur: 1800,
      },
    ],
  },

  // 5. Зона эволюции
  {
    title: { ru: 'Зона эволюции', en: 'The evolution zone' },
    text: {
      ru: 'Рабочие фигуры — Конь, Слон, Ладья и Петух — умеют эволюционировать. Если такая фигура заканчивает ход в дальней зоне (ряды 6–8; для Петуха — 7–8), она превращается в усиленную форму. Один раз и необратимо.',
      en: "Working pieces — Knight, Bishop, Rook and Rooster — can evolve. If such a piece ends its move in the far zone (ranks 6–8; for the Rooster 7–8), it transforms into a stronger form. Once and irreversibly.",
    },
    board: zoneBoard,
    script: [
      { t: 'marks', marks: [...zoneMarks([5, 6, 7]), { sq: sq(3, 3), kind: 'focus' }], dur: 900 },
      {
        t: 'caption',
        text: { ru: 'Зелёная зона — зона эволюции', en: 'The green area is the evolution zone' },
        dur: 2000,
      },
      { t: 'arrow', from: sq(3, 3), to: sq(4, 5), dur: 700 },
      { t: 'move', from: sq(3, 3), to: sq(4, 5), dur: 900 },
      {
        t: 'caption',
        text: {
          ru: 'Ход завершён в зоне — время эволюции!',
          en: 'The move ended inside the zone — time to evolve!',
        },
        style: 'event',
        dur: 2200,
      },
    ],
  },

  // 6. Эволюция: выбор формы
  {
    title: { ru: 'Эволюция: выбор формы', en: 'Evolution: choose a form' },
    text: {
      ru: 'Конь, Слон и Ладья выбирают 1 из 2 форм — появляется окно выбора. Петух превращается в единственную форму — Феникса, умеющего ходить назад. Эволюция — смена роли, а не путь к ферзю. Форму отмечает золотой значок.',
      en: 'The Knight, Bishop and Rook choose 1 of 2 forms — a dialog appears. The Rooster turns into its single form — the Phoenix, which can move backward. Evolution is a change of role, not a path to a queen. A gold badge marks the form.',
    },
    board: evoBoard,
    script: [
      {
        t: 'caption',
        text: { ru: 'Конь входит в зону эволюции…', en: 'The knight enters the evolution zone…' },
        dur: 1400,
      },
      { t: 'marks', marks: zoneMarks([5, 6, 7]), dur: 400 },
      { t: 'move', from: sq(3, 3), to: sq(4, 5), dur: 800 },
      { t: 'panel', options: ['N_OUTRIDER', 'N_HUNTER'], kind: 'evolution', dur: 1400 },
      { t: 'pick', index: 0, dur: 1000 },
      { t: 'transform', square: sq(4, 5), into: 'N_OUTRIDER', dur: 1400 },
      {
        t: 'caption',
        text: {
          ru: 'Дозорный! Конь теперь умеет и шагать по прямой',
          en: 'Outrider! The knight can now also step orthogonally',
        },
        style: 'event',
        dur: 2400,
      },
    ],
  },

  // 7. Бастион (рокировка)
  {
    title: { ru: 'Рокировка (Бастион)', en: 'Castling (Bastion)' },
    text: {
      ru: 'Король (на f) рокируется в сторону любой из ладей, смещаясь на 2 клетки: к j — на h1, к a — на d1; ладья перепрыгивает к нему. Условия — как в шахматах: никто не ходил, между ними пусто, король не под боем и не идёт через битые поля.',
      en: "The King (on f) castles toward either rook, moving 2 squares: toward j — to h1, toward a — to d1; the rook jumps beside it. Conditions as in chess: neither piece has moved, the path is clear, the king isn't in check and doesn't cross attacked squares.",
    },
    board: castleBoard,
    script: [
      {
        t: 'marks',
        marks: [{ sq: sq(5, 0), kind: 'focus' }, ...marksOf([sq(7, 0), sq(3, 0)], 'move')],
        dur: 800,
      },
      {
        t: 'caption',
        text: { ru: 'Король может рокироваться в обе стороны', en: 'The king can castle either way' },
        dur: 2000,
      },
      { t: 'arrow', from: sq(5, 0), to: sq(7, 0), dur: 600 },
      { t: 'arrow', from: sq(9, 0), to: sq(6, 0), dur: 700 },
      {
        t: 'move',
        from: sq(5, 0),
        to: sq(7, 0),
        rook: { from: sq(9, 0), to: sq(6, 0) },
        dur: 1100,
      },
      {
        t: 'caption',
        text: { ru: 'Король и ладья — одним ходом', en: 'King and rook — in a single move' },
        dur: 2000,
      },
    ],
  },

  // 8. Превращение пешки
  {
    title: { ru: 'Превращение пешки', en: 'Pawn promotion' },
    text: {
      ru: 'Пешка на последнем ряду обязана превратиться — выбор из пяти фигур: Ферзь, Ладья, Слон, Конь или Петух. Превращённая фигура получает значок и уже никогда не эволюционирует: превращение и эволюция не совмещаются.',
      en: 'A pawn on the last rank must promote — a choice of five: Queen, Rook, Bishop, Knight or Rooster. The promoted piece gets a badge and never evolves: promotion and evolution are mutually exclusive.',
    },
    board: promoBoard,
    script: [
      { t: 'marks', marks: [{ sq: sq(4, 6), kind: 'focus' }, { sq: sq(4, 7), kind: 'move' }], dur: 700 },
      {
        t: 'caption',
        text: { ru: 'Пешка достигает последнего ряда…', en: 'The pawn reaches the last rank…' },
        dur: 1600,
      },
      { t: 'arrow', from: sq(4, 6), to: sq(4, 7), dur: 600 },
      { t: 'move', from: sq(4, 6), to: sq(4, 7), dur: 800 },
      { t: 'panel', options: ['Q', 'R', 'B', 'N', 'ROO'], kind: 'promotion', dur: 1500 },
      { t: 'pick', index: 0, dur: 1000 },
      { t: 'transform', square: sq(4, 7), into: 'Q', dur: 1300 },
      {
        t: 'caption',
        text: {
          ru: 'Ферзь! Превращённая фигура не эволюционирует',
          en: 'A queen! A promoted piece never evolves',
        },
        style: 'event',
        dur: 2400,
      },
    ],
  },

  // 9. Взятие на проходе
  {
    title: { ru: 'Взятие на проходе', en: 'En passant' },
    text: {
      ru: 'Если пешка соперника прыгает на две клетки и проскакивает поле, которое бьёт твоя пешка, — её можно взять «на проходе», встав на проскоченное поле. Право действует только сразу в ответ.',
      en: 'If an enemy pawn jumps two squares past a square your pawn attacks, you may capture it “en passant”, landing on the passed square. The right lasts only for the immediate reply.',
    },
    board: epBoard,
    script: [
      {
        t: 'caption',
        text: { ru: 'Чёрная пешка идёт на две клетки…', en: 'The black pawn advances two squares…' },
        dur: 1500,
      },
      { t: 'move', from: sq(3, 6), to: sq(3, 4), dur: 900 },
      { t: 'marks', marks: [{ sq: sq(3, 5), kind: 'move' }, { sq: sq(3, 4), kind: 'focus' }], dur: 500 },
      {
        t: 'caption',
        text: { ru: '…и проскакивает битое поле d6', en: '…passing the attacked square d6' },
        dur: 2000,
      },
      { t: 'arrow', from: sq(4, 4), to: sq(3, 5), dur: 700 },
      { t: 'move', from: sq(4, 4), to: sq(3, 5), capture: sq(3, 4), dur: 1100 },
      {
        t: 'caption',
        text: { ru: 'Взятие на проходе!', en: 'En passant!' },
        style: 'event',
        dur: 2000,
      },
    ],
  },

  // 10. Шах и мат
  {
    title: { ru: 'Шах и мат', en: 'Check and checkmate' },
    text: {
      ru: 'Цель — мат вражескому королю. Важное отличие Chess 2: эволюционирующий ход МОЖЕТ сразу давать шах. Здесь ферзь при поддержке короля загоняет чёрного короля в угол.',
      en: 'The goal is to checkmate the enemy king. A key Chess 2 difference: an evolving move MAY give check immediately. Here the queen, backed by her king, corners the black king.',
    },
    board: mateBoard,
    script: [
      {
        t: 'caption',
        text: { ru: 'Ферзь идёт в атаку…', en: 'The queen attacks…' },
        dur: 1400,
      },
      { t: 'move', from: sq(1, 3), to: sq(1, 6), dur: 900 },
      { t: 'arrow', from: sq(1, 6), to: sq(0, 7), dur: 500 },
      { t: 'check', square: sq(0, 7), dur: 1200 },
      { t: 'caption', text: { ru: 'Шах!', en: 'Check!' }, style: 'danger', dur: 1600 },
      { t: 'mate', square: sq(0, 7), dur: 600 },
      {
        t: 'caption',
        text: { ru: 'Мат. Партия окончена', en: 'Checkmate. The game is over' },
        style: 'event',
        dur: 2600,
      },
    ],
  },
];
