/**
 * «Мы отправили письмо на {email}» + кнопка повторной отправки с UI-таймером на
 * 60 секунд (сервер всё равно не пришлёт чаще раза в минуту). Переиспользуется
 * на экране регистрации и при попытке входа с неподтверждённой почтой.
 */

import { useEffect, useState } from 'react';
import { apiResendVerification } from '../api/auth';
import { useT, useLang } from '../i18n';

const COOLDOWN_SEC = 60;

export function CheckEmailNotice({ email }: { email: string }) {
  const t = useT();
  const lang = useLang();
  const [left, setLeft] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [left]);

  async function resend() {
    setDone(false);
    try {
      await apiResendVerification(email, lang);
    } catch {
      /* ответ всегда ok; сеть не критична для этого экрана */
    }
    setDone(true);
    setLeft(COOLDOWN_SEC);
    window.setTimeout(() => setDone(false), 3000);
  }

  return (
    <div className="check-email">
      <p>
        {t('checkEmailBody')} <strong>{email}</strong>.
      </p>
      <p className="muted">{t('checkEmailSpam')}</p>
      <button
        className="btn btn-subtle btn-block"
        onClick={() => void resend()}
        disabled={left > 0}
      >
        {left > 0 ? `${t('resendWait')} ${left}s` : t('resendBtn')}
      </button>
      {done && <p className="form-ok">{t('resendDone')}</p>}
    </div>
  );
}
