/**
 * Отправка писем через SMTP (Gmail) поверх nodemailer.
 *
 * Один транспорт создаётся один раз при старте (createMailer). sendMail не
 * бросает исключение наружу — логирует ошибку и возвращает признак успеха,
 * чтобы вызывающий код (регистрация, восстановление) сам решал, как реагировать
 * (например, аккаунт всё равно создаётся, а письмо можно переотправить кнопкой).
 *
 * Тексты писем — на двух языках (ru/en), по умолчанию ru.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../env';

export type Lang = 'ru' | 'en';

/** Краткое читаемое описание ошибки SMTP для лога (code + message). */
function errText(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { code?: string; responseCode?: number; message?: string };
    return [err.code, err.responseCode, err.message].filter(Boolean).join(' ');
  }
  return String(e);
}

export interface Mailer {
  sendMail(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean>;
  sendVerificationEmail(to: string, lang: Lang, link: string): Promise<boolean>;
  sendPasswordResetEmail(to: string, lang: Lang, link: string): Promise<boolean>;
  sendEmailChangeConfirmation(to: string, lang: Lang, link: string): Promise<boolean>;
  sendAccountDeleteCode(to: string, lang: Lang, code: string): Promise<boolean>;
}

/** Простой каркас письма: заголовок + текст + опциональная кнопка/код. */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0f1115;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#e6e8ee">
  <div style="max-width:480px;margin:0 auto;background:#171a21;border-radius:12px;padding:28px">
    <h1 style="margin:0 0 16px;font-size:20px;color:#fff">${title}</h1>
    ${bodyHtml}
    <p style="margin:24px 0 0;font-size:12px;color:#8a90a2">Chess 2 · ASCENT</p>
  </div></body></html>`;
}

function button(label: string, link: string): string {
  return `<p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#4f7cff;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${label}</a></p>
  <p style="margin:8px 0;font-size:13px;color:#8a90a2;word-break:break-all">${link}</p>`;
}

/* ---------- Тексты ---------- */

interface Template {
  subject: string;
  title: string;
  intro: string;
  action: string;
  expiry: string;
}

const T = {
  verify: {
    ru: {
      subject: 'Подтверждение почты — Chess 2',
      title: 'Подтвердите почту',
      intro: 'Чтобы начать играть, подтвердите свой адрес — нажмите кнопку ниже.',
      action: 'Подтвердить почту',
      expiry: 'Ссылка действует 24 часа. Если вы не регистрировались — просто проигнорируйте письмо.',
    },
    en: {
      subject: 'Verify your email — Chess 2',
      title: 'Verify your email',
      intro: 'To start playing, confirm your address by clicking the button below.',
      action: 'Verify email',
      expiry: 'The link is valid for 24 hours. If you did not sign up, just ignore this email.',
    },
  },
  reset: {
    ru: {
      subject: 'Восстановление пароля — Chess 2',
      title: 'Сброс пароля',
      intro: 'Вы запросили смену пароля. Нажмите кнопку, чтобы задать новый.',
      action: 'Задать новый пароль',
      expiry: 'Ссылка действует 1 час. Если вы этого не запрашивали — проигнорируйте письмо, пароль не изменится.',
    },
    en: {
      subject: 'Password reset — Chess 2',
      title: 'Reset password',
      intro: 'You requested a password change. Click the button to set a new one.',
      action: 'Set a new password',
      expiry: 'The link is valid for 1 hour. If you did not request this, ignore the email — your password stays unchanged.',
    },
  },
  emailChange: {
    ru: {
      subject: 'Подтверждение новой почты — Chess 2',
      title: 'Подтвердите новый адрес',
      intro: 'Вы меняете почту аккаунта на этот адрес. Подтвердите его, нажав кнопку.',
      action: 'Подтвердить адрес',
      expiry: 'Ссылка действует 24 часа. Старый адрес продолжает работать, пока новый не подтверждён.',
    },
    en: {
      subject: 'Confirm your new email — Chess 2',
      title: 'Confirm your new email',
      intro: 'You are changing your account email to this address. Confirm it by clicking the button.',
      action: 'Confirm address',
      expiry: 'The link is valid for 24 hours. Your old address keeps working until the new one is confirmed.',
    },
  },
} satisfies Record<string, Record<Lang, Template>>;

const DELETE_CODE = {
  ru: {
    subject: 'Код удаления аккаунта — Chess 2',
    title: 'Удаление аккаунта',
    intro: 'Код для подтверждения удаления аккаунта:',
    expiry: 'Код действует 10 минут. Если вы не запрашивали удаление — срочно смените пароль.',
  },
  en: {
    subject: 'Account deletion code — Chess 2',
    title: 'Account deletion',
    intro: 'Your account deletion confirmation code:',
    expiry: 'The code is valid for 10 minutes. If you did not request deletion, change your password immediately.',
  },
} satisfies Record<Lang, { subject: string; title: string; intro: string; expiry: string }>;

function para(text: string, color = '#c7ccda'): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:${color}">${text}</p>`;
}

export function createMailer(env: Env): Mailer {
  const transport: Transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // 465 → TLS сразу
    // Gmail App Password показывается с пробелами для читаемости — SMTP-логин
    // ждёт 16 символов без них. Убираем пробелы на всякий случай.
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS.replace(/\s+/g, '') },
    // Быстрый отказ вместо зависания на минуты, если до SMTP не достучаться.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  // Разовая проверка связи при старте — в логах сразу видно, работает ли SMTP.
  transport
    .verify()
    .then(() => console.log('SMTP: соединение с почтовым сервером установлено.'))
    .catch((e: unknown) =>
      console.error('SMTP: не удалось подключиться к почтовому серверу:', errText(e)),
    );

  async function sendMail(msg: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<boolean> {
    try {
      await transport.sendMail({ from: env.SMTP_FROM, ...msg });
      return true;
    } catch (e) {
      // Не роняем вызывающий код: письмо можно переотправить кнопкой. Причину
      // (сообщение SMTP, не секрет) логируем и в проде — иначе не отладить.
      console.error(`sendMail error → ${msg.to}:`, errText(e));
      return false;
    }
  }

  function linkEmail(tpl: Template, to: string, link: string): Promise<boolean> {
    const html = layout(tpl.title, para(tpl.intro) + button(tpl.action, link) + para(tpl.expiry, '#8a90a2'));
    const text = `${tpl.title}\n\n${tpl.intro}\n${link}\n\n${tpl.expiry}`;
    return sendMail({ to, subject: tpl.subject, html, text });
  }

  return {
    sendMail,
    sendVerificationEmail: (to, lang, link) => linkEmail(T.verify[lang], to, link),
    sendPasswordResetEmail: (to, lang, link) => linkEmail(T.reset[lang], to, link),
    sendEmailChangeConfirmation: (to, lang, link) => linkEmail(T.emailChange[lang], to, link),
    sendAccountDeleteCode: (to, lang, code) => {
      const tpl = DELETE_CODE[lang];
      const codeHtml = `<p style="margin:16px 0;font-size:30px;letter-spacing:6px;font-weight:bold;color:#fff">${code}</p>`;
      const html = layout(tpl.title, para(tpl.intro) + codeHtml + para(tpl.expiry, '#8a90a2'));
      const text = `${tpl.title}\n\n${tpl.intro} ${code}\n\n${tpl.expiry}`;
      return sendMail({ to, subject: tpl.subject, html, text });
    },
  };
}
