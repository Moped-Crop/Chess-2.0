import { useState } from 'react';
import { PRESETS } from '../clock/clock';
import { useT, useLang } from '../i18n';

/**
 * Выбор контроля времени перед приглашением в партию. Общий для списка друзей
 * и для приглашения прямо из переписки — список пресетов и разметка не
 * дублируются (PRESETS остаётся единственным источником правды).
 *
 * Тумблер «рейтинговая партия» прокидывается в onPick вместе с контролем
 * времени: рейтинговую партию можно сыграть и с другом напрямую (защита от
 * фарма — на сервере, в rating.ts).
 */
export function TimeControlPicker({
  onPick,
}: {
  onPick: (timeControlId: string, ranked: boolean) => void;
}) {
  const t = useT();
  const lang = useLang();
  const [ranked, setRanked] = useState(false);
  return (
    <div className="invite-presets">
      <span className="invite-presets-label">{t('timeControl')}</span>
      <label className="invite-ranked-toggle">
        <input type="checkbox" checked={ranked} onChange={(e) => setRanked(e.target.checked)} />
        {t('rankedToggle')}
      </label>
      <div className="invite-presets-btns">
        {PRESETS.map((p) => (
          <button key={p.id} className="btn btn-subtle" onClick={() => onPick(p.id, ranked)}>
            {lang === 'en' ? p.labelEn : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
