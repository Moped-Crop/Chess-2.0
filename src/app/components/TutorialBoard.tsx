import { useEffect, useMemo, useState } from 'react';
import { fileOf, rankOf, FILE_COUNT, RANK_COUNT, BOARD_SIZE } from '../../engine/board';
import type { Piece, PieceType } from '../../engine/types';
import { squareToXY } from '../boardView';
import { PieceView } from './Piece';
import { MiniPiece } from './MiniPiece';
import { PIECE_NAME, PIECE_NAME_EN } from '../pieceMeta';
import { useT, useLang } from '../i18n';
import type { Lesson, Mark, TutStep, Bilingual } from '../tutorial/lessons';

const CELL = 46;
const LOOP_HOLD = 2200; // пауза перед повтором сценария

/** Длительность шага по умолчанию, мс. */
function stepDur(step: TutStep): number {
  if (step.dur !== undefined) return step.dur;
  switch (step.t) {
    case 'caption':
      return 1800;
    case 'marks':
      return 800;
    case 'arrow':
      return 700;
    case 'clear':
      return 400;
    case 'move':
      return 900;
    case 'panel':
      return 1400;
    case 'pick':
      return 1000;
    case 'transform':
      return 1300;
    case 'check':
      return 1200;
    case 'mate':
      return 2400;
    case 'pause':
      return 800;
    case 'practice':
      // В демо-плеере не проигрывается (шаг существует только для
      // /how-to-play, где его обрабатывает своя страница).
      return 0;
  }
}

interface SceneAnim {
  kind: 'move' | 'transform';
  from?: number;
  to: number;
  rook?: { from: number; to: number };
  captured?: { sq: number; piece: Piece };
  durMs: number;
}

interface Scene {
  board: (Piece | null)[];
  marks: Mark[];
  arrows: { from: number; to: number }[];
  caption: { text: Bilingual; style: 'info' | 'event' | 'danger' } | null;
  panel: { options: PieceType[]; kind: 'evolution' | 'promotion'; chosen: number | null } | null;
  checkSq: number | null;
  mateSq: number | null;
  anim: SceneAnim | null;
}

/** Свернуть шаги 0..idx в состояние сцены. Шаг idx даёт активную анимацию. */
function buildScene(lesson: Lesson, idx: number): Scene {
  const scene: Scene = {
    board: lesson.board.slice(),
    marks: [],
    arrows: [],
    caption: null,
    panel: null,
    checkSq: null,
    mateSq: null,
    anim: null,
  };
  for (let i = 0; i <= Math.min(idx, lesson.script.length - 1); i++) {
    const st = lesson.script[i];
    const isCurrent = i === idx;
    switch (st.t) {
      case 'caption':
        scene.caption = { text: st.text, style: st.style ?? 'info' };
        break;
      case 'marks':
        scene.marks = st.marks;
        break;
      case 'arrow':
        scene.arrows.push({ from: st.from, to: st.to });
        break;
      case 'clear':
        scene.marks = [];
        scene.arrows = [];
        scene.caption = null;
        break;
      case 'move': {
        const captured =
          st.capture !== undefined && scene.board[st.capture]
            ? { sq: st.capture, piece: scene.board[st.capture]! }
            : undefined;
        if (st.capture !== undefined) scene.board[st.capture] = null;
        const mover = scene.board[st.from];
        scene.board[st.from] = null;
        if (mover) scene.board[st.to] = { ...mover, hasMoved: true };
        if (st.rook) {
          const rook = scene.board[st.rook.from];
          scene.board[st.rook.from] = null;
          if (rook) scene.board[st.rook.to] = { ...rook, hasMoved: true };
        }
        if (isCurrent) {
          scene.anim = {
            kind: 'move',
            from: st.from,
            to: st.to,
            rook: st.rook,
            captured,
            durMs: stepDur(st),
          };
        }
        break;
      }
      case 'panel':
        scene.panel = { options: st.options, kind: st.kind, chosen: null };
        break;
      case 'pick':
        if (scene.panel) scene.panel = { ...scene.panel, chosen: st.index };
        break;
      case 'transform': {
        const old = scene.board[st.square];
        scene.board[st.square] = {
          type: st.into,
          color: old?.color ?? 'white',
          hasMoved: true,
          evolved: true,
        };
        scene.panel = null;
        if (isCurrent) scene.anim = { kind: 'transform', to: st.square, durMs: stepDur(st) };
        break;
      }
      case 'check':
        scene.checkSq = st.square;
        break;
      case 'mate':
        scene.mateSq = st.square;
        scene.checkSq = null;
        break;
      case 'pause':
        break;
    }
  }
  return scene;
}

/**
 * Проигрыватель урока: исполняет сценарий шаг за шагом — подсветки, стрелки,
 * плашки, настоящие анимированные ходы, панели выбора, эффекты эволюции,
 * шаха и мата. По окончании сценарий повторяется.
 */
export function TutorialBoard({ lesson, runId }: { lesson: Lesson; runId: number }) {
  const t = useT();
  const lang = useLang();
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);

  // Сброс при смене урока или ручном повторе.
  useEffect(() => {
    setStep(0);
    setCycle((c) => c + 1);
  }, [lesson, runId]);

  // Таймер шагов: по завершении сценария — пауза и повтор.
  useEffect(() => {
    const script = lesson.script;
    if (script.length === 0) return;
    const done = step >= script.length;
    const delay = done ? LOOP_HOLD : stepDur(script[step]);
    const id = window.setTimeout(() => {
      if (done) {
        setStep(0);
        setCycle((c) => c + 1);
      } else {
        setStep(step + 1);
      }
    }, delay);
    return () => window.clearTimeout(id);
  }, [lesson, step, cycle]);

  const sceneIdx = Math.min(step, lesson.script.length - 1);
  const scene = useMemo(() => buildScene(lesson, sceneIdx), [lesson, sceneIdx]);

  const W = FILE_COUNT * CELL;
  const H = RANK_COUNT * CELL;
  const xOf = (s: number) => squareToXY(s, false, CELL).x;
  const yOf = (s: number) => squareToXY(s, false, CELL).y;
  const animKey = `${cycle}-${sceneIdx}`;

  /* --- Клетки --- */
  const cells = [];
  for (let s = 0; s < BOARD_SIZE; s++) {
    const dark = (fileOf(s) + rankOf(s)) % 2 === 0;
    cells.push(
      <rect
        key={`c${s}`}
        x={xOf(s)}
        y={yOf(s)}
        width={CELL}
        height={CELL}
        fill={dark ? '#b58863' : '#f0d9b5'}
      />,
    );
  }

  /* --- Подсветки --- */
  const overlays = [];
  const dots = [];
  for (let i = 0; i < scene.marks.length; i++) {
    const { sq: s, kind } = scene.marks[i];
    const x = xOf(s);
    const y = yOf(s);
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;
    if (kind === 'zone') {
      overlays.push(
        <rect key={`m${i}`} x={x} y={y} width={CELL} height={CELL} fill="#34c759" opacity={0.22} />,
      );
    } else if (kind === 'focus') {
      overlays.push(
        <rect
          key={`m${i}`}
          x={x + 1.5}
          y={y + 1.5}
          width={CELL - 3}
          height={CELL - 3}
          fill="#5b7cfa"
          fillOpacity={0.22}
          stroke="#7d95ff"
          strokeWidth={2.5}
          rx={4}
        />,
      );
    } else if (kind === 'move') {
      dots.push(
        <circle key={`d${i}`} className="dest-dot" cx={cx} cy={cy} r={CELL * 0.16} fill="#5b7cfa" opacity={0.75} />,
      );
    } else if (kind === 'capture') {
      dots.push(
        <circle
          key={`d${i}`}
          className="dest-ring"
          cx={cx}
          cy={cy}
          r={CELL * 0.42}
          fill="none"
          stroke="#5b7cfa"
          strokeWidth={3.5}
          opacity={0.85}
        />,
      );
    } else if (kind === 'no') {
      const p = CELL * 0.24;
      dots.push(
        <path
          key={`d${i}`}
          d={`M${cx - p},${cy - p} L${cx + p},${cy + p} M${cx + p},${cy - p} L${cx - p},${cy + p}`}
          stroke="#ef4757"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.9}
        />,
      );
    }
  }

  /* --- Шах / мат --- */
  const effects = [];
  if (scene.checkSq !== null) {
    effects.push(
      <circle
        key={`chk${animKey}`}
        className="check-pulse"
        cx={xOf(scene.checkSq) + CELL / 2}
        cy={yOf(scene.checkSq) + CELL / 2}
        r={CELL * 0.55}
        fill="url(#tutCheckGlow)"
      />,
    );
  }

  /* --- Фигуры (анимированные — отдельно) --- */
  const animatedSquares = new Set<number>();
  if (scene.anim) {
    animatedSquares.add(scene.anim.to);
    if (scene.anim.rook) animatedSquares.add(scene.anim.rook.to);
  }

  const pieces = [];
  for (let s = 0; s < BOARD_SIZE; s++) {
    const p = scene.board[s];
    if (!p || animatedSquares.has(s)) continue;
    pieces.push(<PieceView key={`p${s}`} piece={p} x={xOf(s)} y={yOf(s)} size={CELL} />);
  }

  const animated = [];
  if (scene.anim) {
    const a = scene.anim;
    const slideMs = Math.min(Math.max(a.durMs - 250, 250), 650);
    if (a.kind === 'move') {
      if (a.captured) {
        animated.push(
          <g key={`cap${animKey}`} className="tut-fade-out" style={{ animationDelay: `${slideMs - 120}ms` }}>
            <PieceView piece={a.captured.piece} x={xOf(a.captured.sq)} y={yOf(a.captured.sq)} size={CELL} />
          </g>,
        );
      }
      const mover = scene.board[a.to];
      if (mover && a.from !== undefined) {
        animated.push(
          <g
            key={`mv${animKey}`}
            className="tut-slide"
            style={{
              ['--dx' as string]: `${xOf(a.from) - xOf(a.to)}px`,
              ['--dy' as string]: `${yOf(a.from) - yOf(a.to)}px`,
              ['--tut-dur' as string]: `${slideMs}ms`,
            }}
          >
            <PieceView piece={mover} x={xOf(a.to)} y={yOf(a.to)} size={CELL} />
          </g>,
        );
      }
      if (a.rook) {
        const rook = scene.board[a.rook.to];
        if (rook) {
          animated.push(
            <g
              key={`rk${animKey}`}
              className="tut-slide"
              style={{
                ['--dx' as string]: `${xOf(a.rook.from) - xOf(a.rook.to)}px`,
                ['--dy' as string]: `${yOf(a.rook.from) - yOf(a.rook.to)}px`,
                ['--tut-dur' as string]: `${slideMs}ms`,
              }}
            >
              <PieceView piece={rook} x={xOf(a.rook.to)} y={yOf(a.rook.to)} size={CELL} />
            </g>,
          );
        }
      }
    } else {
      // transform: вспышка + появление формы
      const p = scene.board[a.to];
      const cx = xOf(a.to) + CELL / 2;
      const cy = yOf(a.to) + CELL / 2;
      animated.push(
        <g key={`tf${animKey}`}>
          <circle className="tut-glow" cx={cx} cy={cy} r={CELL * 0.75} fill="url(#tutEvoGlow)" />
          <circle className="tut-ring" cx={cx} cy={cy} r={CELL * 0.36} fill="none" stroke="#ffd75e" strokeWidth={2.5} />
          <circle
            className="tut-ring"
            style={{ animationDelay: '160ms' }}
            cx={cx}
            cy={cy}
            r={CELL * 0.36}
            fill="none"
            stroke="#ffedb0"
            strokeWidth={2}
          />
          {p && (
            <g className="tut-pop-in">
              <PieceView piece={p} x={xOf(a.to)} y={yOf(a.to)} size={CELL} />
            </g>
          )}
        </g>,
      );
    }
  }

  /* --- Стрелки --- */
  const arrows = scene.arrows.map((ar, i) => {
    const x1 = xOf(ar.from) + CELL / 2;
    const y1 = yOf(ar.from) + CELL / 2;
    const x2 = xOf(ar.to) + CELL / 2;
    const y2 = yOf(ar.to) + CELL / 2;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    // Укоротить у наконечника, чтобы стрелка не накрывала фигуру целиком.
    const k = (len - CELL * 0.34) / len;
    return (
      <g key={`ar${i}-${animKey}`} className="tut-arrow">
        <line
          x1={x1}
          y1={y1}
          x2={x1 + (x2 - x1) * k}
          y2={y1 + (y2 - y1) * k}
          stroke="#5b7cfa"
          strokeWidth={7}
          strokeLinecap="round"
          markerEnd="url(#tutArrowHead)"
          opacity={0.9}
        />
      </g>
    );
  });

  /* --- Мат: затемнение --- */
  const mateLayer = [];
  if (scene.mateSq !== null) {
    mateLayer.push(
      <g key={`mate${animKey}`} className="tut-mate-dim">
        <rect x={0} y={0} width={W} height={H} fill="#05070b" opacity={0.5} />
        <circle
          cx={xOf(scene.mateSq) + CELL / 2}
          cy={yOf(scene.mateSq) + CELL / 2}
          r={CELL * 0.72}
          fill="url(#tutEvoGlow)"
        />
        <g transform={`translate(${xOf(scene.mateSq)},${yOf(scene.mateSq)})`}>
          {scene.board[scene.mateSq] && (
            <PieceView piece={scene.board[scene.mateSq]!} x={0} y={0} size={CELL} />
          )}
        </g>
      </g>,
    );
  }

  const nameOf = (pt: PieceType) => (lang === 'en' ? PIECE_NAME_EN[pt] : PIECE_NAME[pt]);

  return (
    <div className="tut-board-wrap">
      <svg className="tut-board" viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="tutCheckGlow">
            <stop offset="0%" stopColor="#ff3b30" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#ff3b30" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff3b30" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tutEvoGlow">
            <stop offset="0%" stopColor="#ffd75e" stopOpacity="0.85" />
            <stop offset="60%" stopColor="#ffb300" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
          </radialGradient>
          <marker
            id="tutArrowHead"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#5b7cfa" />
          </marker>
        </defs>
        <g shapeRendering="crispEdges">{cells}</g>
        {overlays}
        {effects}
        {pieces}
        {animated}
        {dots}
        {arrows}
        {mateLayer}
      </svg>

      {scene.panel && (
        <div className={`tut-panel ${scene.panel.kind === 'evolution' ? 'evo' : ''}`}>
          <div className="tut-panel-title">
            {scene.panel.kind === 'evolution' ? t('chooseEvolution') : t('choosePromotion')}
          </div>
          <div className="tut-panel-options">
            {scene.panel.options.map((pt, i) => (
              <div key={pt} className={`tut-panel-opt ${scene.panel!.chosen === i ? 'picked' : ''}`}>
                <MiniPiece type={pt} color="white" size={scene.panel!.kind === 'evolution' ? 44 : 34} />
                <span>{nameOf(pt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scene.caption && (
        <div key={scene.caption.text.ru} className={`tut-caption ${scene.caption.style}`}>
          {scene.caption.text[lang]}
        </div>
      )}
    </div>
  );
}
