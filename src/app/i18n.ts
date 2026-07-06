/**
 * Локализация интерфейса (RU/EN). Лёгкий словарь строк + хук useT().
 * Язык хранится в сторе и сохраняется в настройках.
 */

import { useGameStore } from './store/gameStore';

export type Lang = 'ru' | 'en';

const STRINGS = {
  ru: {
    subtitle: 'вариант 10×8',
    help: 'Как играть?',
    white: 'Белые',
    black: 'Чёрные',
    toMove: 'ход',
    whiteToMove: 'Ход белых',
    blackToMove: 'Ход чёрных',
    whiteWins: 'Белые победили',
    blackWins: 'Чёрные победили',
    draw: 'Ничья',
    check: 'шах!',
    tabGame: 'Партия',
    tabMoves: 'Ходы',
    tabSettings: 'Настройки',
    newGame: 'Новая партия',
    undo: 'Отменить ход',
    undoDisabled: 'Недоступно с часами',
    match: 'Партия',
    export: 'Экспорт',
    import: 'Импорт',
    importError: 'Не удалось прочитать файл партии.',
    moveNo: 'Ход №',
    noMoves: 'Партия ещё не начата.',
    timeControl: 'Контроль времени',
    boardOrientation: 'Ориентация доски',
    whiteBottom: 'Белые снизу',
    blackBottom: 'Чёрные снизу',
    autoFlip: 'Автоповорот',
    boardTheme: 'Тема доски',
    sound: 'Звук',
    volume: 'Громкость',
    soundOn: '🔊 Звук включён',
    soundOff: '🔇 Звук выключен',
    language: 'Язык',
    chooseEvolution: 'Выбери форму эволюции',
    choosePromotion: 'Выбери фигуру превращения',
    evolutionEvent: 'Эволюция',
    evolutionSub: 'Фигура достигла зоны эволюции. Выбор необратим.',
    promotionSub: 'Пешка достигла последнего ряда.',
    cancel: 'Отмена',
    lightTheme: 'Светлая тема',
    darkTheme: 'Тёмная тема',
    reasonMate: 'Мат',
    reasonTime: 'Время вышло',
    reasonDraw: 'Пат, повторение или правило 75 ходов',
    back: 'Назад',
    next: 'Далее',
    done: 'Готово',
    close: 'Закрыть',
    replay: 'Повторить',
    footnote:
      'Кликни свою фигуру — подсветятся её ходы (точка — ход, кольцо — взятие). Зелёным показана зона эволюции выбранной рабочей фигуры. Партия автоматически сохраняется. Новичку — кнопка «Как играть?».',
  },
  en: {
    subtitle: '10×8 variant',
    help: 'How to play?',
    white: 'White',
    black: 'Black',
    toMove: 'to move',
    whiteToMove: 'White to move',
    blackToMove: 'Black to move',
    whiteWins: 'White wins',
    blackWins: 'Black wins',
    draw: 'Draw',
    check: 'check!',
    tabGame: 'Game',
    tabMoves: 'Moves',
    tabSettings: 'Settings',
    newGame: 'New game',
    undo: 'Undo move',
    undoDisabled: 'Unavailable with a clock',
    match: 'Match',
    export: 'Export',
    import: 'Import',
    importError: 'Could not read the game file.',
    moveNo: 'Move',
    noMoves: 'No moves yet.',
    timeControl: 'Time control',
    boardOrientation: 'Board orientation',
    whiteBottom: 'White below',
    blackBottom: 'Black below',
    autoFlip: 'Auto-flip',
    boardTheme: 'Board theme',
    sound: 'Sound',
    volume: 'Volume',
    soundOn: '🔊 Sound on',
    soundOff: '🔇 Sound off',
    language: 'Language',
    chooseEvolution: 'Choose evolution form',
    choosePromotion: 'Choose promotion piece',
    evolutionEvent: 'Evolution',
    evolutionSub: 'The piece has reached its evolution zone. The choice is irreversible.',
    promotionSub: 'The pawn has reached the last rank.',
    cancel: 'Cancel',
    lightTheme: 'Light theme',
    darkTheme: 'Dark theme',
    reasonMate: 'Checkmate',
    reasonTime: 'Time is up',
    reasonDraw: 'Stalemate, repetition or the 75-move rule',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    close: 'Close',
    replay: 'Replay',
    footnote:
      'Click your piece to see its moves (dot — move, ring — capture). The evolution zone of the selected working piece is shown in green. The game is saved automatically. New here? Use the “How to play?” button.',
  },
} satisfies Record<Lang, Record<string, string>>;

export type StrKey = keyof (typeof STRINGS)['ru'];

export function translate(lang: Lang, key: StrKey): string {
  return STRINGS[lang][key] ?? STRINGS.ru[key];
}

/** Хук: возвращает функцию перевода, привязанную к текущему языку. */
export function useT(): (key: StrKey) => string {
  const lang = useGameStore((s) => s.lang);
  return (key) => translate(lang, key);
}

export function useLang(): Lang {
  return useGameStore((s) => s.lang);
}
