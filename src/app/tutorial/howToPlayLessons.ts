/**
 * Контент раздела /how-to-play: те же 10 тем, что в LESSONS (lessons.ts), но
 * после каждого нетривиального механизма — шаг 'practice': игроку дают
 * НАСТОЯЩУЮ доску и просят сделать ход самому (реальными легальными ходами
 * через движок), прежде чем открыть «Далее».
 *
 * lessons.ts сознательно не редактируется (его позиции не экспортированы) —
 * стартовые расстановки объявлены здесь заново теми же маленькими хелперами.
 * ВАЖНО: в практических позициях есть оба короля — в отличие от демо-сцен,
 * здесь работает настоящий legalMoves с проверкой королевской безопасности.
 * Тексты про движение фигур сверены с Rules_Clarification_v1.0.md (B2/B3).
 */

import type { Color, Piece, PieceType } from '../../engine/types';
import { sq, BOARD_SIZE } from '../../engine/board';
import { createInitialState } from '../../engine';
import type { Lesson, TutStep, Mark, MarkKind } from './lessons';

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

/** Практическая позиция: базовая расстановка + оба короля по углам. */
function withKings(
  board: (Piece | null)[],
  whiteKing = sq(9, 0),
  blackKing = sq(9, 7),
): (Piece | null)[] {
  const b = board.slice();
  b[whiteKing] = pc('K', 'white');
  b[blackKing] = pc('K', 'black');
  return b;
}

/* ---------- Демо-позиции (продублированы из lessons.ts) ---------- */

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

/* ---------- Практические позиции (с королями) ---------- */

// Короли по умолчанию: белый j1, чёрный j8 — далеко от места действия.
const practiceRooster = withKings(roosterForward);
const practiceRoosterCapture = withKings(roosterCapture);
// Взятие конём: слон стоит на f5 (ВНЕ зоны эволюции — в демо-позиции он на
// e6, но там реальный движок открыл бы окно выбора формы и смешал два урока);
// короли расставлены так, чтобы диагональ слона не давала случайный шах.
const practiceCaptureBase = empty();
practiceCaptureBase[sq(3, 3)] = pc('N', 'white');
practiceCaptureBase[sq(5, 4)] = pc('B', 'black');
const practiceCapture = withKings(practiceCaptureBase, sq(0, 0), sq(9, 7));
const practiceEvo = withKings(evoBoard);
// Бастион: позиция урока уже содержит белого короля — добавляем только чёрного.
const practiceCastle = castleBoard.slice();
practiceCastle[sq(9, 7)] = pc('K', 'black');
// Превращение: чёрный король подальше от e8, чтобы не мешать превращению.
const practicePromo = withKings(promoBoard, sq(0, 0), sq(9, 7));
// Взятие на проходе: чёрная пешка УЖЕ прыгнула d7→d5, право e.p. активно (d6).
const practiceEp = empty();
practiceEp[sq(4, 4)] = pc('P', 'white');
practiceEp[sq(3, 4)] = { ...pc('P', 'black'), hasMoved: true };
const practiceEpBoard = withKings(practiceEp, sq(9, 0), sq(0, 7));
// Мат в один ход — позиция финального демо.
const practiceMate = mateBoard.slice();

/* ---------- Уроки ---------- */

export const HOW_TO_PLAY_LESSONS: Lesson[] = [
  // 1. Знакомство (без практики — вступление)
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
      { t: 'marks', marks: marksOf([sq(3, 0), sq(6, 0), sq(3, 7), sq(6, 7)], 'focus'), dur: 700 },
      {
        t: 'caption',
        text: { ru: 'Новая фигура — Петух (d1 и g1)', en: 'A new piece — the Rooster (d1 and g1)' },
        dur: 2200,
      },
      { t: 'clear', dur: 400 },
      {
        t: 'caption',
        text: {
          ru: 'Дальше каждый механизм ты попробуешь сам — на настоящей доске',
          en: 'From here on you will try every mechanic yourself — on a real board',
        },
        style: 'event',
        dur: 2400,
      },
    ],
  },

  // 2. Петух: только вперёд + практика
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
        t: 'practice',
        goal: { ru: 'Теперь сам: сходи Петухом вперёд', en: 'Your turn: move the Rooster forward' },
        successCaption: { ru: 'Отлично! Назад пути нет', en: 'Great! There is no way back' },
        board: practiceRooster,
        turn: 'white',
        check: (move, before) =>
          before.board[move.from]?.type === 'ROO' && move.capture === undefined,
      },
    ],
  },

  // 3. Петух: бок и взятие + практика
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
      {
        t: 'practice',
        goal: { ru: 'Возьми Петухом пешку', en: 'Capture a pawn with the Rooster' },
        successCaption: { ru: 'Взятие!', en: 'Captured!' },
        board: practiceRoosterCapture,
        turn: 'white',
        check: (move, before) =>
          before.board[move.from]?.type === 'ROO' && move.capture !== undefined,
      },
    ],
  },

  // 4. Взятие фигуры + практика
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
        t: 'practice',
        goal: { ru: 'Возьми слона конём', en: 'Capture the bishop with your knight' },
        successCaption: { ru: 'Слон снят с доски', en: 'The bishop is removed from the board' },
        board: practiceCapture,
        turn: 'white',
        check: (move) => move.capture !== undefined,
      },
    ],
  },

  // 5. Зона эволюции (без практики — подводка к уроку 6)
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
          ru: 'Ход завершён в зоне — время эволюции! Сейчас попробуешь сам',
          en: 'The move ended inside the zone — time to evolve! You will try it next',
        },
        style: 'event',
        dur: 2400,
      },
    ],
  },

  // 6. Эволюция: выбор формы + практика
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
        t: 'practice',
        goal: {
          ru: 'Заведи коня в зелёную зону и выбери форму',
          en: 'Move the knight into the green zone and pick a form',
        },
        successCaption: { ru: 'Эволюция! Форма выбрана', en: 'Evolved! Form chosen' },
        board: practiceEvo,
        turn: 'white',
        check: (move) => move.evolveTo !== undefined,
      },
    ],
  },

  // 7. Бастион + практика
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
        t: 'practice',
        goal: { ru: 'Сделай рокировку (в любую сторону)', en: 'Castle (either side)' },
        successCaption: { ru: 'Король и ладья — одним ходом', en: 'King and rook — in a single move' },
        board: practiceCastle,
        turn: 'white',
        check: (move) => move.special === 'castle-king' || move.special === 'castle-queen',
      },
    ],
  },

  // 8. Превращение пешки + практика
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
        t: 'practice',
        goal: { ru: 'Проведи пешку и выбери фигуру', en: 'Promote the pawn and pick a piece' },
        successCaption: {
          ru: 'Превращение! Такая фигура не эволюционирует',
          en: 'Promoted! This piece never evolves',
        },
        board: practicePromo,
        turn: 'white',
        check: (move) => move.promotion !== undefined,
      },
    ],
  },

  // 9. Взятие на проходе + практика
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
        t: 'practice',
        goal: {
          ru: 'Чёрная пешка только что прыгнула на d5. Возьми её на проходе',
          en: 'The black pawn just jumped to d5. Capture it en passant',
        },
        successCaption: { ru: 'Взятие на проходе!', en: 'En passant!' },
        board: practiceEpBoard,
        turn: 'white',
        enPassant: sq(3, 5),
        check: (move) => move.special === 'enpassant',
      },
    ],
  },

  // 10. Шах и мат + финальная практика
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
      {
        t: 'practice',
        goal: {
          ru: 'Финальное упражнение: поставь мат в один ход',
          en: 'Final exercise: deliver checkmate in one move',
        },
        successCaption: { ru: 'Мат! Обучение пройдено', en: 'Checkmate! Tutorial complete' },
        board: practiceMate,
        turn: 'white',
        check: (_move, _before, after) => after.result === 'white' || after.result === 'black',
      },
    ],
  },
];

/** Практический шаг урока (последний в script), если есть. */
export function practiceOf(lesson: Lesson): Extract<TutStep, { t: 'practice' }> | null {
  const last = lesson.script[lesson.script.length - 1];
  return last && last.t === 'practice' ? last : null;
}

/** Урок без практического шага — для проигрывания в TutorialBoard. */
export function demoOf(lesson: Lesson): Lesson {
  return { ...lesson, script: lesson.script.filter((s) => s.t !== 'practice') };
}
