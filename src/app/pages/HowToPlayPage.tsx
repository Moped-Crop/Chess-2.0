import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { Board } from '../components/Board';
import { EvolutionModal } from '../components/EvolutionModal';
import { TutorialBoard } from '../components/TutorialBoard';
import { EvolutionReference } from '../components/EvolutionReference';
import { HOW_TO_PLAY_LESSONS, practiceOf, demoOf } from '../tutorial/howToPlayLessons';
import { useGameStore } from '../store/gameStore';
import { useT, useLang } from '../i18n';

/**
 * «Как играть» — интерактивный тур (отдельная страница, доступна без логина):
 * демонстрация урока (TutorialBoard, как в локальном демо) → практика на
 * НАСТОЯЩЕЙ доске (mode='tutorial' в сторе: реальные легальные ходы движком,
 * та же анимация и модалка эволюции, что в живой партии) → справочник
 * эволюций. Прогресс — в localStorage.
 */

const TOTAL = HOW_TO_PLAY_LESSONS.length;
const PROGRESS_KEY = 'chess2.howToPlayProgress.v1';

interface Progress {
  done: boolean[];
  lastIdx: number;
}

function loadProgress(): Progress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { done: new Array<boolean>(TOTAL).fill(false), lastIdx: 0 };
    const p = JSON.parse(raw) as Progress;
    if (!Array.isArray(p.done) || p.done.length !== TOTAL) throw new Error('stale');
    return { done: p.done.map(Boolean), lastIdx: Math.min(Math.max(0, p.lastIdx | 0), TOTAL - 1) };
  } catch {
    return { done: new Array<boolean>(TOTAL).fill(false), lastIdx: 0 };
  }
}

function saveProgress(p: Progress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* приватный режим — просто без сохранения */
  }
}

type View = 'lesson' | 'reference';
type Phase = 'demo' | 'practice';

export function HowToPlayPage() {
  const t = useT();
  const lang = useLang();

  const startTutorialPractice = useGameStore((s) => s.startTutorialPractice);
  const exitTutorialPractice = useGameStore((s) => s.exitTutorialPractice);

  const [initial] = useState(loadProgress);
  const hadProgress = initial.done.some(Boolean) || initial.lastIdx > 0;
  const [resumeAsk, setResumeAsk] = useState(hadProgress);
  const [view, setView] = useState<View>('lesson');
  const [i, setI] = useState(initial.lastIdx);
  const [done, setDone] = useState<boolean[]>(initial.done);
  const [phase, setPhase] = useState<Phase>('demo');
  const [passed, setPassed] = useState(false);
  const [runId, setRunId] = useState(0);

  const lesson = HOW_TO_PLAY_LESSONS[i];
  const practice = practiceOf(lesson);
  const allDone = done.every(Boolean);

  /* --- Практика: загрузка позиции в стор и выход при любом уходе --- */
  useEffect(() => {
    if (view !== 'lesson' || phase !== 'practice' || !practice || resumeAsk) return;
    startTutorialPractice({
      board: practice.board,
      turn: practice.turn,
      enPassant: practice.enPassant ?? null,
    });
    return () => exitTutorialPractice();
  }, [view, phase, i, resumeAsk, practice, startTutorialPractice, exitTutorialPractice]);

  /* --- Проверка цели: подписка на ходы в сторе --- */
  useEffect(() => {
    if (view !== 'lesson' || phase !== 'practice' || !practice || resumeAsk) return;
    setPassed(false);
    const unsub = useGameStore.subscribe((s, prev) => {
      if (s.mode !== 'tutorial' || prev.mode !== 'tutorial') return;
      if (s.moveLog.length <= prev.moveLog.length) return;
      const mv = s.lastMoveApplied;
      // Песочница: неподходящий ход не блокируется — просто цель не засчитана.
      if (mv && practice.check(mv, prev.game, s.game)) setPassed(true);
    });
    return unsub;
  }, [view, phase, i, resumeAsk, practice]);

  function markDoneAndNext() {
    const nextDone = done.map((d, k) => (k === i ? true : d));
    setDone(nextDone);
    if (i + 1 < TOTAL) {
      setI(i + 1);
      setPhase('demo');
      setPassed(false);
      saveProgress({ done: nextDone, lastIdx: i + 1 });
    } else {
      // Последний урок пройден — финальный экран = справочник.
      saveProgress({ done: nextDone, lastIdx: i });
      setView('reference');
    }
  }

  function skip() {
    if (i + 1 < TOTAL) {
      setI(i + 1);
      setPhase('demo');
      setPassed(false);
      saveProgress({ done, lastIdx: i + 1 });
    } else {
      setView('reference');
    }
  }

  function goBack() {
    if (phase === 'practice') {
      setPhase('demo');
      setPassed(false);
      return;
    }
    if (i > 0) {
      setI(i - 1);
      setPhase('demo');
      setPassed(false);
      saveProgress({ done, lastIdx: i - 1 });
    }
  }

  function restart() {
    const fresh = { done: new Array<boolean>(TOTAL).fill(false), lastIdx: 0 };
    setDone(fresh.done);
    setI(0);
    setPhase('demo');
    setPassed(false);
    setView('lesson');
    setResumeAsk(false);
    saveProgress(fresh);
  }

  /* --- Экран «продолжить или заново» при возвращении --- */
  if (resumeAsk) {
    const doneCount = done.filter(Boolean).length;
    return (
      <div className="app htp-page">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <Link className="btn btn-ghost" to="/menu">← {t('menuBack')}</Link>
          </div>
        </header>
        <div className="htp-card card">
          <h2 className="htp-title">{t('menuHowTo')}</h2>
          <div className="tut-progress" aria-hidden>
            {HOW_TO_PLAY_LESSONS.map((_, k) => (
              <span key={k} className={done[k] ? 'done' : ''} />
            ))}
          </div>
          <p className="tut-text">
            {t('htpResumeText')} ({doneCount} / {TOTAL})
          </p>
          <div className="tut-nav">
            <button className="btn btn-primary" onClick={() => setResumeAsk(false)}>
              {t('htpContinue')}
            </button>
            <button className="btn btn-subtle" onClick={restart}>
              {t('htpStartOver')}
            </button>
            <button className="btn btn-ghost spacer" onClick={() => { setResumeAsk(false); setView('reference'); }}>
              {t('htpReferenceShort')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* --- Справочник эволюций (и финальный экран) --- */
  if (view === 'reference') {
    return (
      <div className="app htp-page">
        <header className="topbar">
          <Brand />
          <div className="topbar-actions">
            <Link className="btn btn-ghost" to="/menu">← {t('menuBack')}</Link>
          </div>
        </header>
        <div className="htp-card card htp-card-wide">
          <div className="tut-head">
            <h3>{t('htpReference')}</h3>
            {allDone && <span className="tut-step">✓ {t('htpAllDone')}</span>}
          </div>
          <EvolutionReference />
          <div className="tut-nav" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => setView('lesson')}>
              {t('htpBackToTour')}
            </button>
            {allDone && (
              <button className="btn btn-subtle" onClick={restart}>
                {t('htpStartOver')}
              </button>
            )}
            <Link className="btn btn-ghost spacer" to="/menu">
              {t('close')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* --- Урок: демо или практика --- */
  return (
    <div className="app htp-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => setView('reference')}>
            📖 {t('htpReferenceShort')}
          </button>
          <Link className="btn btn-ghost" to="/menu">← {t('menuBack')}</Link>
        </div>
      </header>

      <div className={`htp-card card ${phase === 'practice' ? 'htp-card-wide' : ''}`}>
        <div className="tut-head">
          <h3>{lesson.title[lang]}</h3>
          <span className="tut-step">{i + 1} / {TOTAL}</span>
        </div>

        <div className="tut-progress" aria-hidden>
          {HOW_TO_PLAY_LESSONS.map((_, k) => (
            <span key={k} className={done[k] ? 'done' : k === i ? 'current' : ''} />
          ))}
        </div>

        {phase === 'demo' ? (
          <>
            <TutorialBoard lesson={demoOf(lesson)} runId={runId} />
            <p className="tut-text">{lesson.text[lang]}</p>
            <div className="tut-nav">
              <button className="btn btn-subtle" onClick={goBack} disabled={i === 0}>
                {t('back')}
              </button>
              {practice ? (
                <button className="btn btn-primary" onClick={() => setPhase('practice')}>
                  {t('htpTryIt')}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={markDoneAndNext}>
                  {i + 1 === TOTAL ? t('done') : t('next')}
                </button>
              )}
              {practice && (
                <button className="btn btn-ghost" onClick={skip}>
                  {t('htpSkip')}
                </button>
              )}
              <button className="btn btn-ghost spacer" title={t('replay')} onClick={() => setRunId(runId + 1)}>
                ⟳ {t('replay')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`htp-goal ${passed ? 'event' : ''}`}>
              {passed && practice ? practice.successCaption[lang] : practice?.goal[lang]}
            </div>
            <div className="htp-board">
              <Board />
            </div>
            <div className="tut-nav" style={{ marginTop: 14 }}>
              <button className="btn btn-subtle" onClick={goBack}>
                {t('htpBackToDemo')}
              </button>
              <button className="btn btn-primary" onClick={markDoneAndNext} disabled={!passed}>
                {i + 1 === TOTAL ? t('done') : t('next')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (!practice) return;
                  setPassed(false);
                  startTutorialPractice({
                    board: practice.board,
                    turn: practice.turn,
                    enPassant: practice.enPassant ?? null,
                  });
                }}
              >
                ⟳ {t('htpReset')}
              </button>
              <button className="btn btn-ghost spacer" onClick={skip}>
                {t('htpSkip')}
              </button>
            </div>
          </>
        )}
      </div>

      <EvolutionModal />
    </div>
  );
}
