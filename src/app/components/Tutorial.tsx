import { useState } from 'react';
import { LESSONS } from '../tutorial/lessons';
import { TutorialBoard } from './TutorialBoard';
import { useT, useLang } from '../i18n';

/** Раздел «Как играть»: интерактивные уроки-сцены с навигацией и повтором. */
export function Tutorial({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [i, setI] = useState(0);
  const [runId, setRunId] = useState(0);
  const lesson = LESSONS[i];
  const last = i === LESSONS.length - 1;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal tutorial" onClick={(e) => e.stopPropagation()}>
        <div className="tut-head">
          <h3>{lesson.title[lang]}</h3>
          <span className="tut-step">
            {i + 1} / {LESSONS.length}
          </span>
        </div>

        <div className="tut-progress" aria-hidden>
          {LESSONS.map((_, k) => (
            <span key={k} className={k < i ? 'done' : k === i ? 'current' : ''} />
          ))}
        </div>

        <TutorialBoard lesson={lesson} runId={runId} />

        <p className="tut-text">{lesson.text[lang]}</p>

        <div className="tut-nav">
          <button className="btn btn-subtle" onClick={() => setI(i - 1)} disabled={i === 0}>
            {t('back')}
          </button>
          {last ? (
            <button className="btn btn-primary" onClick={onClose}>
              {t('done')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setI(i + 1)}>
              {t('next')}
            </button>
          )}
          <button
            className="btn btn-ghost"
            title={t('replay')}
            onClick={() => setRunId(runId + 1)}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
              <path
                d="M12 5V2L7 6l5 4V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"
                fill="currentColor"
              />
            </svg>
            {t('replay')}
          </button>
          <button className="btn btn-ghost spacer" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
