import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, RotateCcw, Bot, Check } from 'lucide-react';
import { Brand } from '../components/Brand';
import { Board } from '../components/Board';
import { EvolutionModal } from '../components/EvolutionModal';
import { TutorialBoard } from '../components/TutorialBoard';
import { EvolutionReference } from '../components/EvolutionReference';
import { HOW_TO_PLAY_LESSONS, practiceOf, demoOf } from '../tutorial/howToPlayLessons';
import { useGameStore } from '../store/gameStore';
import { useT, useLang } from '../i18n';
import { Card, Button } from '../components/ui';

/**
 * «Как играть» — интерактивный тур (отдельная страница, доступна без логина):
 * демонстрация урока (TutorialBoard) → практика на НАСТОЯЩЕЙ доске
 * (mode='tutorial': реальные легальные ходы движком, та же модалка эволюции) →
 * справочник эволюций. Прогресс — в localStorage.
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

type View = 'lesson' | 'reference' | 'done';
type Phase = 'demo' | 'practice';

/** Общая шапка страницы «Как играть». */
function HtpHeader({ children }: { children?: React.ReactNode }) {
  const t = useT();
  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        {children}
        <Button variant="ghost" size="sm" icon={ArrowLeft} to="/menu">
          {t('menuBack')}
        </Button>
      </div>
    </header>
  );
}

export function HowToPlayPage() {
  const t = useT();
  const lang = useLang();

  const startTutorialPractice = useGameStore((s) => s.startTutorialPractice);
  const exitTutorialPractice = useGameStore((s) => s.exitTutorialPractice);

  const [initial] = useState(loadProgress);
  const initialAllDone = initial.done.every(Boolean);
  const hadProgress = initial.done.some(Boolean) || initial.lastIdx > 0;
  // Если всё пройдено — вопроса «продолжить?» нет, сразу финальный экран.
  const [resumeAsk, setResumeAsk] = useState(hadProgress && !initialAllDone);
  const [view, setView] = useState<View>(initialAllDone ? 'done' : 'lesson');
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

  /* --- Проверка цели: подписка на ходы в сторе. «Далее» откроется, только
     если ход выполнил именно цель шага (step.check), а не «сделан любой ход». */
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
      // Последний урок пройден — финальный экран.
      saveProgress({ done: nextDone, lastIdx: i });
      setView('done');
    }
  }

  function skip() {
    if (i + 1 < TOTAL) {
      setI(i + 1);
      setPhase('demo');
      setPassed(false);
      saveProgress({ done, lastIdx: i + 1 });
    } else {
      setView('done');
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

  function resetPractice() {
    if (!practice) return;
    setPassed(false);
    startTutorialPractice({
      board: practice.board,
      turn: practice.turn,
      enPassant: practice.enPassant ?? null,
    });
  }

  /* --- Экран «продолжить или начать сначала» (только если пройдено не всё) --- */
  if (resumeAsk) {
    const doneCount = done.filter(Boolean).length;
    return (
      <div className="app htp-page">
        <HtpHeader />
        <Card className="htp-card">
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
            <Button variant="primary" onClick={() => setResumeAsk(false)}>
              {t('htpContinue')}
            </Button>
            <Button variant="secondary" icon={RotateCcw} onClick={restart}>
              {t('htpStartOver')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /* --- Финальный экран (обучение пройдено) --- */
  if (view === 'done') {
    return (
      <div className="app htp-page">
        <HtpHeader />
        <Card className="htp-card htp-final">
          <span className="htp-final-icon" aria-hidden>
            <Check size={30} strokeWidth={2} />
          </span>
          <h2 className="htp-title">{t('htpAllDone')}</h2>
          <p className="tut-text">{t('htpDoneText')}</p>
          <div className="htp-final-actions">
            <Button variant="primary" icon={Bot} to="/play/bot/setup">
              {t('htpPlayBot')}
            </Button>
            <Button variant="secondary" icon={BookOpen} onClick={() => setView('reference')}>
              {t('htpReference')}
            </Button>
            <Button variant="ghost" icon={RotateCcw} onClick={restart}>
              {t('htpStartOver')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /* --- Справочник эволюций --- */
  if (view === 'reference') {
    return (
      <div className="app htp-page">
        <HtpHeader />
        <Card className="htp-card htp-card-wide">
          <div className="tut-head">
            <h3>{t('htpReference')}</h3>
            {allDone && (
              <span className="tut-step htp-done-badge">
                <Check size={14} strokeWidth={2.25} aria-hidden /> {t('htpAllDone')}
              </span>
            )}
          </div>
          <EvolutionReference />
          <div className="tut-nav" style={{ marginTop: 16 }}>
            <Button variant="primary" onClick={() => setView(allDone ? 'done' : 'lesson')}>
              {allDone ? t('back') : t('htpBackToTour')}
            </Button>
            {allDone && (
              <Button variant="secondary" icon={RotateCcw} onClick={restart}>
                {t('htpStartOver')}
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* --- Урок: демо или практика --- */
  return (
    <div className="app htp-page">
      <HtpHeader>
        <Button variant="ghost" size="sm" icon={BookOpen} onClick={() => setView('reference')}>
          {t('htpReferenceShort')}
        </Button>
      </HtpHeader>

      <Card className={`htp-card ${phase === 'practice' ? 'htp-card-wide' : ''}`}>
        <div className="tut-head">
          <h3>{lesson.title[lang]}</h3>
          <span className="tut-step">
            {i + 1} / {TOTAL}
          </span>
        </div>

        <div className="tut-progress" aria-hidden>
          {HOW_TO_PLAY_LESSONS.map((_, k) => (
            // Текущий шаг подсвечивается ВСЕГДА (даже если он уже пройден) —
            // иначе при листании назад индикатор не двигался.
            <span key={k} className={k === i ? 'current' : done[k] ? 'done' : ''} />
          ))}
        </div>

        {phase === 'demo' ? (
          <>
            <TutorialBoard lesson={demoOf(lesson)} runId={runId} />
            <p className="tut-text">{lesson.text[lang]}</p>
            <div className="tut-nav">
              <Button variant="secondary" onClick={goBack} disabled={i === 0}>
                {t('back')}
              </Button>
              {practice ? (
                <Button variant="primary" onClick={() => setPhase('practice')}>
                  {t('htpTryIt')}
                </Button>
              ) : (
                <Button variant="primary" onClick={markDoneAndNext}>
                  {i + 1 === TOTAL ? t('done') : t('next')}
                </Button>
              )}
              {practice && (
                <Button variant="ghost" onClick={skip}>
                  {t('htpSkip')}
                </Button>
              )}
              <Button
                variant="ghost"
                icon={RotateCcw}
                className="spacer"
                onClick={() => setRunId(runId + 1)}
              >
                {t('replay')}
              </Button>
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
              <Button variant="secondary" onClick={goBack}>
                {t('htpBackToDemo')}
              </Button>
              <Button variant="primary" onClick={markDoneAndNext} disabled={!passed}>
                {i + 1 === TOTAL ? t('done') : t('next')}
              </Button>
              <Button variant="ghost" icon={RotateCcw} onClick={resetPractice}>
                {t('htpReset')}
              </Button>
              <Button variant="ghost" className="spacer" onClick={skip}>
                {t('htpSkip')}
              </Button>
            </div>
          </>
        )}
      </Card>

      <EvolutionModal />
    </div>
  );
}
