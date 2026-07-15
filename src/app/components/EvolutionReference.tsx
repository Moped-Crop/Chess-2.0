/**
 * Справочник эволюций: 7 карточек (2 формы Коня/Слона/Ладьи, 1 Петуха).
 * На карточке — базовая фигура → форма, краткое описание хода и мини-доска
 * 5×5 с отметками движения. Движения сверены с Rules_Clarification_v1.0.md
 * (таблица B2): точка — ход и взятие; контурная точка — только ход (без
 * взятия и атаки); кольцо — только взятие.
 */

import type { PieceType } from '../../engine/types';
import { PieceView } from './Piece';
import { MiniPiece } from './MiniPiece';
import { PIECE_NAME, PIECE_NAME_EN, FORM_HINT, FORM_HINT_EN } from '../pieceMeta';
import { useT, useLang } from '../i18n';

const CELL = 30;
const N = 5; // мини-доска 5×5, фигура в центре (2,2)

type MarkKind = 'both' | 'moveOnly' | 'captureOnly';
interface MiniMark {
  dx: number;
  dy: number; // dy > 0 = вперёд (вверх доски)
  kind: MarkKind;
}

const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const WAZIR: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FERZ: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALFIL: [number, number][] = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
const DABBABA: [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2]];
/** Лучи слайдера в пределах 5×5: 1 и 2 клетки по направлению. */
function rays(dirs: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of dirs) {
    out.push([dx, dy], [dx * 2, dy * 2]);
  }
  return out;
}
const DIAG_RAYS = rays(FERZ);
const ORTH_RAYS = rays(WAZIR);

function marks(both: [number, number][], moveOnly: [number, number][] = [], captureOnly: [number, number][] = []): MiniMark[] {
  const seen = new Set<string>();
  const out: MiniMark[] = [];
  const add = (list: [number, number][], kind: MarkKind) => {
    for (const [dx, dy] of list) {
      const key = `${dx},${dy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) out.push({ dx, dy, kind });
    }
  };
  add(both, 'both');
  add(moveOnly, 'moveOnly');
  add(captureOnly, 'captureOnly');
  return out;
}

interface FormCard {
  base: PieceType;
  form: PieceType;
  marks: MiniMark[];
}

const CARDS: FormCard[] = [
  { base: 'N', form: 'N_OUTRIDER', marks: marks([...KNIGHT, ...WAZIR]) },
  { base: 'N', form: 'N_HUNTER', marks: marks([...KNIGHT, ...FERZ]) },
  { base: 'B', form: 'B_PRELATE', marks: marks([...DIAG_RAYS, ...WAZIR]) },
  { base: 'B', form: 'B_ZEALOT', marks: marks([...DIAG_RAYS, ...ALFIL]) },
  { base: 'R', form: 'R_RAM', marks: marks([...ORTH_RAYS, ...DABBABA]) },
  // Опора: диагональный шаг — только ход (не атакует и не бьёт).
  { base: 'R', form: 'R_ANCHOR', marks: marks(ORTH_RAYS, FERZ) },
  // Феникс: вперёд-прямо — ход и взятие; назад/вбок — только ход;
  // две диагонали-вперёд — только взятие.
  {
    base: 'ROO',
    form: 'ROO_PHOENIX',
    marks: marks([[0, 1]], [[1, 0], [-1, 0], [0, -1]], [[1, 1], [-1, 1]]),
  },
];

/** Мини-доска 5×5: форма в центре, отметки её движения вокруг. */
function MiniDiagram({ card }: { card: FormCard }) {
  const size = N * CELL;
  const cells = [];
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      const dark = (x + y) % 2 === 1;
      cells.push(
        <rect key={`${x}-${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={dark ? '#b58863' : '#f0d9b5'} />,
      );
    }
  }
  const cx = (dx: number) => (2 + dx) * CELL + CELL / 2;
  const cy = (dy: number) => (2 - dy) * CELL + CELL / 2; // вперёд = вверх
  return (
    <svg className="evo-ref-diagram" viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g shapeRendering="crispEdges">{cells}</g>
      {card.marks.map((m, i) =>
        m.kind === 'captureOnly' ? (
          <circle key={i} cx={cx(m.dx)} cy={cy(m.dy)} r={CELL * 0.34} fill="none" stroke="#ef4757" strokeWidth={3} opacity={0.9} />
        ) : m.kind === 'moveOnly' ? (
          <circle key={i} cx={cx(m.dx)} cy={cy(m.dy)} r={CELL * 0.16} fill="none" stroke="#5b7cfa" strokeWidth={2.5} opacity={0.9} />
        ) : (
          <circle key={i} cx={cx(m.dx)} cy={cy(m.dy)} r={CELL * 0.17} fill="#5b7cfa" opacity={0.85} />
        ),
      )}
      <PieceView piece={{ type: card.form, color: 'white', hasMoved: true, evolved: true }} x={2 * CELL} y={2 * CELL} size={CELL} />
    </svg>
  );
}

export function EvolutionReference() {
  const t = useT();
  const lang = useLang();
  const nameOf = (pt: PieceType) => (lang === 'en' ? PIECE_NAME_EN[pt] : PIECE_NAME[pt]);
  const hintOf = (pt: PieceType) => (lang === 'en' ? FORM_HINT_EN[pt] : FORM_HINT[pt]) ?? '';

  return (
    <div className="evo-ref">
      <div className="evo-ref-grid">
        {CARDS.map((c) => (
          <div key={c.form} className="evo-ref-card card">
            <div className="evo-ref-head">
              <MiniPiece type={c.base} color="white" size={26} />
              <span className="evo-ref-arrow" aria-hidden>→</span>
              <MiniPiece type={c.form} color="white" size={30} />
              <span className="evo-ref-names">
                <b>{nameOf(c.form)}</b>
                <span className="evo-ref-base">{nameOf(c.base)}</span>
              </span>
            </div>
            <MiniDiagram card={c} />
            <p className="evo-ref-hint">{hintOf(c.form)}</p>
          </div>
        ))}
      </div>
      <div className="evo-ref-legend">
        <span><span className="lg-dot" /> {t('htpLegendBoth')}</span>
        <span><span className="lg-move" /> {t('htpLegendMove')}</span>
        <span><span className="lg-cap" /> {t('htpLegendCapture')}</span>
      </div>
    </div>
  );
}
