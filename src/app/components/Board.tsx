import { useGameStore } from '../store/gameStore';
import { fileOf, rankOf, FILE_COUNT, RANK_COUNT, BOARD_SIZE } from '../../engine/board';
import { inEvoZone, isWorking, isKingInCheck, findKing } from '../../engine';
import { squareToXY } from '../boardView';
import { themeById } from '../theme';
import { PieceView } from './Piece';

const CELL = 62;
const FRAME = 10; // внутренняя рамка вокруг клеток
const FILE_LETTERS = 'abcdefghij';

/**
 * SVG-доска 10×8: скруглённая рамка, координаты внутри клеток, мягкие
 * подсветки и анимации (скольжение фигур, растворение взятых, вспышка
 * эволюции/превращения, пульс шаха). Разворот — белые/чёрные снизу или авто.
 */
export function Board() {
  const game = useGameStore((s) => s.game);
  const selected = useGameStore((s) => s.selected);
  const legal = useGameStore((s) => s.legal);
  const lastMove = useGameStore((s) => s.lastMove);
  const lastAction = useGameStore((s) => s.lastAction);
  const orientation = useGameStore((s) => s.orientation);
  const theme = themeById(useGameStore((s) => s.themeId));
  const clickSquare = useGameStore((s) => s.clickSquare);

  const W = FILE_COUNT * CELL;
  const H = RANK_COUNT * CELL;
  const flipped = orientation === 'black' || (orientation === 'auto' && game.turn === 'black');
  const xOf = (s: number) => squareToXY(s, flipped, CELL).x;
  const yOf = (s: number) => squareToXY(s, flipped, CELL).y;

  // Цели выбранной фигуры: to → это взятие?
  const destinations = new Map<number, boolean>();
  if (selected !== null) {
    for (const m of legal) {
      if (m.from === selected) {
        const occ = game.board[m.to];
        destinations.set(m.to, occ !== null || m.special === 'enpassant');
      }
    }
  }

  const selPiece = selected !== null ? game.board[selected] : null;
  const showZone = !!selPiece && isWorking(selPiece.type) && !selPiece.evolved;
  const checkSquare =
    game.result === 'ongoing' && isKingInCheck(game.board, game.turn)
      ? findKing(game.board, game.turn)
      : null;

  // Клетки с анимированными фигурами рисуются в отдельном слое.
  const animatedSquares = new Set<number>();
  if (lastAction) {
    animatedSquares.add(lastAction.to);
    if (lastAction.rookTo !== undefined) animatedSquares.add(lastAction.rookTo);
  }

  const cells = [];
  const marks = [];
  const pieces = [];
  const coords = [];

  for (let s = 0; s < BOARD_SIZE; s++) {
    const f = fileOf(s);
    const r = rankOf(s);
    const x = xOf(s);
    const y = yOf(s);
    const dark = (f + r) % 2 === 0; // a1 (0,0) — тёмное
    const isDest = destinations.has(s);
    const hasOwn =
      game.result === 'ongoing' && game.board[s] !== null && game.board[s]!.color === game.turn;

    cells.push(
      <rect
        key={`c${s}`}
        className={`cell ${dark ? 'cell-d' : 'cell-l'} ${isDest ? 'cell-dest' : ''} ${hasOwn ? 'cell-own' : ''}`}
        x={x}
        y={y}
        width={CELL}
        height={CELL}
        fill={dark ? theme.dark : theme.light}
        onClick={() => clickSquare(s)}
      />,
    );

    // Координаты внутри клеток: буквы файлов — нижний ряд, цифры рангов — левый столбец.
    const col = x / CELL;
    const row = y / CELL;
    if (row === RANK_COUNT - 1) {
      coords.push(
        <text
          key={`cf${s}`}
          x={x + CELL - 5}
          y={y + CELL - 5}
          textAnchor="end"
          fontSize={11}
          fontWeight={700}
          fill={dark ? theme.light : theme.dark}
          opacity={0.85}
        >
          {FILE_LETTERS[f]}
        </text>,
      );
    }
    if (col === 0) {
      coords.push(
        <text
          key={`cr${s}`}
          x={x + 5}
          y={y + 15}
          fontSize={11}
          fontWeight={700}
          fill={dark ? theme.light : theme.dark}
          opacity={0.85}
        >
          {r + 1}
        </text>,
      );
    }

    if (showZone && inEvoZone(s, selPiece!)) {
      marks.push(
        <rect key={`z${s}`} x={x} y={y} width={CELL} height={CELL} fill="#34c759" opacity={0.17} />,
      );
    }
    if (lastMove && (lastMove.from === s || lastMove.to === s)) {
      marks.push(
        <rect key={`l${s}`} x={x} y={y} width={CELL} height={CELL} fill="#f6d95c" opacity={0.3} />,
      );
    }
    if (selected === s) {
      marks.push(
        <g key={`s${s}`}>
          <rect x={x} y={y} width={CELL} height={CELL} fill="#5b7cfa" opacity={0.28} />
          <rect
            x={x + 1.5}
            y={y + 1.5}
            width={CELL - 3}
            height={CELL - 3}
            fill="none"
            stroke="#7d95ff"
            strokeWidth={3}
            rx={4}
            opacity={0.9}
          />
        </g>,
      );
    }
    if (checkSquare === s) {
      marks.push(
        <circle
          key={`k${s}`}
          className="check-pulse"
          cx={x + CELL / 2}
          cy={y + CELL / 2}
          r={CELL * 0.52}
          fill="url(#checkGlow)"
        />,
      );
    }

    const piece = game.board[s];
    if (piece && !animatedSquares.has(s)) {
      pieces.push(<PieceView key={`p${s}`} piece={piece} x={x} y={y} size={CELL} />);
    }
  }

  // --- Анимированные слои последнего хода ---
  const animated = [];
  if (lastAction) {
    const seq = lastAction.seq;

    // Растворение взятой фигуры.
    if (lastAction.capturedSquare !== undefined && lastAction.capturedPiece) {
      animated.push(
        <g key={`cap${seq}`} className="anim-capture">
          <PieceView
            piece={lastAction.capturedPiece}
            x={xOf(lastAction.capturedSquare)}
            y={yOf(lastAction.capturedSquare)}
            size={CELL}
          />
        </g>,
      );
    }

    // Скольжение сходившей фигуры from → to.
    const mover = game.board[lastAction.to];
    if (mover) {
      const dx = xOf(lastAction.from) - xOf(lastAction.to);
      const dy = yOf(lastAction.from) - yOf(lastAction.to);
      const cx = xOf(lastAction.to) + CELL / 2;
      const cy = yOf(lastAction.to) + CELL / 2;
      const transformed = lastAction.evolved || lastAction.promoted;
      animated.push(
        <g
          key={`mv${seq}`}
          className="anim-slide"
          style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }}
        >
          {transformed ? (
            <g className="anim-transform-pop">
              <PieceView piece={mover} x={xOf(lastAction.to)} y={yOf(lastAction.to)} size={CELL} />
            </g>
          ) : (
            <PieceView piece={mover} x={xOf(lastAction.to)} y={yOf(lastAction.to)} size={CELL} />
          )}
        </g>,
      );
      // Вспышка эволюции/превращения на клетке прибытия.
      if (transformed) {
        animated.push(
          <g key={`fx${seq}`} pointerEvents="none">
            <circle className="evo-burst-glow" cx={cx} cy={cy} r={CELL * 0.7} fill="url(#evoGlow)" />
            <circle
              className="evo-burst-ring"
              cx={cx}
              cy={cy}
              r={CELL * 0.34}
              fill="none"
              stroke="#ffd75e"
              strokeWidth={3}
            />
            <circle
              className="evo-burst-ring evo-burst-ring-2"
              cx={cx}
              cy={cy}
              r={CELL * 0.34}
              fill="none"
              stroke="#ffedb0"
              strokeWidth={2}
            />
          </g>,
        );
      }
    }

    // Ладья при Бастионе едет одновременно с королём.
    if (lastAction.rookFrom !== undefined && lastAction.rookTo !== undefined) {
      const rook = game.board[lastAction.rookTo];
      if (rook) {
        const dx = xOf(lastAction.rookFrom) - xOf(lastAction.rookTo);
        const dy = yOf(lastAction.rookFrom) - yOf(lastAction.rookTo);
        animated.push(
          <g
            key={`rk${seq}`}
            className="anim-slide"
            style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px` }}
          >
            <PieceView piece={rook} x={xOf(lastAction.rookTo)} y={yOf(lastAction.rookTo)} size={CELL} />
          </g>,
        );
      }
    }
  }

  const dots = [];
  for (const [to, isCapture] of destinations) {
    const cx = xOf(to) + CELL / 2;
    const cy = yOf(to) + CELL / 2;
    if (isCapture) {
      dots.push(
        <circle
          key={`d${to}`}
          className="dest-ring"
          cx={cx}
          cy={cy}
          r={CELL * 0.44}
          fill="none"
          stroke="#5b7cfa"
          strokeWidth={4.5}
          opacity={0.85}
        />,
      );
    } else {
      dots.push(
        <circle
          key={`d${to}`}
          className="dest-dot"
          cx={cx}
          cy={cy}
          r={CELL * 0.15}
          fill="#5b7cfa"
          opacity={0.7}
        />,
      );
    }
  }

  const VW = W + FRAME * 2;
  const VH = H + FRAME * 2;

  return (
    <svg
      className="board-svg"
      viewBox={`0 0 ${VW} ${VH}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ ['--cell-l' as string]: theme.light, ['--cell-d' as string]: theme.dark }}
    >
      <defs>
        {/* Очень мягкая, едва заметная тень фигур — глубина без «шума» */}
        <filter id="pcShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" floodColor="#000" floodOpacity="0.28" />
        </filter>
        <radialGradient id="checkGlow">
          <stop offset="0%" stopColor="#ff3b30" stopOpacity="0.75" />
          <stop offset="70%" stopColor="#ff3b30" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ff3b30" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="evoGlow">
          <stop offset="0%" stopColor="#ffd75e" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#ffb300" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
        </radialGradient>
        <clipPath id="boardClip">
          <rect x={FRAME} y={FRAME} width={W} height={H} rx={8} />
        </clipPath>
      </defs>

      {/* Рамка доски */}
      <rect className="board-frame" x={0} y={0} width={VW} height={VH} rx={14} />
      <rect
        x={FRAME - 1.5}
        y={FRAME - 1.5}
        width={W + 3}
        height={H + 3}
        rx={9}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />

      <g clipPath="url(#boardClip)">
        <g transform={`translate(${FRAME},${FRAME})`}>
          {/* crispEdges: клетки стыкуются пиксель в пиксель, без «швов» сглаживания */}
          <g shapeRendering="crispEdges">{cells}</g>
          {/* Слои поверх клеток не перехватывают клики — иначе подсветки и
              точки-цели блокировали бы ход по клетке под ними. */}
          <g style={{ pointerEvents: 'none' }}>
            {marks}
            {coords}
            <g filter="url(#pcShadow)">
              {pieces}
              {animated}
            </g>
            {dots}
          </g>
        </g>
      </g>
    </svg>
  );
}
