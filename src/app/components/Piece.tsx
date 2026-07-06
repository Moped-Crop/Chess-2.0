import type { Piece } from '../../engine/types';
import { PIECE_ART, isEvolvedType } from '../pieceShapes';

/**
 * Палитра сторон: белые — слоновая кость с тёплой тёмной обводкой,
 * чёрные — уголь с серебристой обводкой. Эволюционные формы дополнительно
 * получают золотые элементы и мягкую золотую ауру (вместо старой плашки).
 */
interface Colors {
  fill: string;
  stroke: string;
  detail: string;
}

function colorsFor(white: boolean): Colors {
  return white
    ? { fill: '#f4efe3', stroke: '#4a4136', detail: '#4a4136' }
    : { fill: '#31343d', stroke: '#d9dee8', detail: '#d9dee8' };
}

const GOLD_FILL = '#e0a92c';
const GOLD_STROKE = '#8a6410';

/** Векторная фигура: силуэт + детали; формы — своя модель с золотом и аурой. */
export function PieceView({
  piece,
  x,
  y,
  size,
}: {
  piece: Piece;
  x: number;
  y: number;
  size: number;
}) {
  const { fill, stroke, detail } = colorsFor(piece.color === 'white');
  const art = PIECE_ART[piece.type];
  const evolved = isEvolvedType(piece.type);
  const k = size / 100;

  return (
    <g pointerEvents="none">
      <g transform={`translate(${x},${y}) scale(${k})`}>
        {evolved && (
          <>
            <defs>
              <radialGradient id="pcGoldAura">
                <stop offset="0%" stopColor="#ffcf4d" stopOpacity="0.5" />
                <stop offset="60%" stopColor="#ffc12e" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#ffc12e" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={50} cy={52} r={47} fill="url(#pcGoldAura)" />
          </>
        )}

        {evolved && (
          // Едва заметное золотое свечение по контуру формы (поверх ауры).
          <path
            d={art.body}
            fill="none"
            stroke="#ffc12e"
            strokeWidth={6.5}
            opacity={0.3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <path
          d={art.body}
          fill={fill}
          stroke={stroke}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {art.lines?.map((l, i) => (
          <path
            key={`l${i}`}
            d={l.d}
            fill="none"
            stroke={detail}
            strokeWidth={l.w ?? 2.2}
            strokeLinecap="round"
            opacity={0.75}
          />
        ))}

        {art.dots?.map((d, i) => (
          <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={detail} />
        ))}

        {art.gold?.map((d, i) => (
          <path
            key={`g${i}`}
            d={d}
            fill={GOLD_FILL}
            stroke={GOLD_STROKE}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        ))}

        {art.goldLines?.map((l, i) => (
          <path
            key={`gl${i}`}
            d={l.d}
            fill="none"
            stroke={GOLD_FILL}
            strokeWidth={l.w ?? 3}
            strokeLinecap="round"
          />
        ))}

        {art.glowDots?.map((d, i) => (
          // Светящаяся точка: мягкий ореол + яркое золотое ядро.
          <g key={`gd${i}`}>
            <circle cx={d.cx} cy={d.cy} r={d.r * 2.2} fill="#ffc12e" opacity={0.35} />
            <circle cx={d.cx} cy={d.cy} r={d.r} fill="#ffd75e" stroke={GOLD_STROKE} strokeWidth={0.8} />
          </g>
        ))}
      </g>
    </g>
  );
}
