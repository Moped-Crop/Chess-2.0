import { PRESETS } from '../clock/clock';
import { useT, useLang } from '../i18n';

/**
 * Выбор контроля времени перед приглашением в партию. Общий для списка друзей
 * и для приглашения прямо из переписки — список пресетов и разметка не
 * дублируются (PRESETS остаётся единственным источником правды).
 */
export function TimeControlPicker({ onPick }: { onPick: (timeControlId: string) => void }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="invite-presets">
      <span className="invite-presets-label">{t('timeControl')}</span>
      <div className="invite-presets-btns">
        {PRESETS.map((p) => (
          <button key={p.id} className="btn btn-subtle" onClick={() => onPick(p.id)}>
            {lang === 'en' ? p.labelEn : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
