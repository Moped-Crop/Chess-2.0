/**
 * Полный E2E-путь (п.14.4 ТЗ): регистрация двух пользователей → смена имени и
 * аватара → дружба → онлайн-партия → ходы с синхронизацией → сдача →
 * обновление статистики. Backend работает на in-memory БД (pg-mem).
 */

import { test, expect, type Page } from '@playwright/test';

const ts = Date.now().toString().slice(-7);
const USER_A = `alice${ts}`;
const USER_B = `bob${ts}`;

// 1×1 px PNG для загрузки аватара.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function register(page: Page, username: string, displayName: string) {
  await page.goto('/register');
  await page.locator('.input').nth(0).fill(username);
  await page.locator('.input').nth(1).fill(`${username}@e2e.dev`);
  await page.locator('.input').nth(2).fill('password-123');
  await page.locator('.input').nth(3).fill(displayName);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/menu');
}

/**
 * Сделать один свой ход: перебираем клетки, пока не появятся подсветки целей,
 * затем кликаем по первой цели (координаты цели → клетка). false — сейчас не
 * наша очередь.
 */
function makeMove(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const cells = [...document.querySelectorAll('.cell')];
    for (let s = 0; s < cells.length; s++) {
      click(cells[s]);
      await wait(15);
      const dot = document.querySelector('.dest-dot, .dest-ring');
      if (dot) {
        const cx = Number(dot.getAttribute('cx'));
        const cy = Number(dot.getAttribute('cy'));
        const target = cells.find((c) => {
          const x = Number(c.getAttribute('x'));
          const y = Number(c.getAttribute('y'));
          return cx > x && cx < x + 62 && cy > y && cy < y + 62;
        });
        if (target) {
          click(target);
          await wait(120);
          // Возможное окно выбора эволюции/превращения — берём первый вариант.
          const card = document.querySelector<HTMLButtonElement>('.choice-card');
          if (card) card.click();
          return true;
        }
      }
    }
    return false;
  });
}

test('полный путь: профили, друзья, онлайн-партия, сдача, статистика', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  // 1–2. Регистрация двух пользователей.
  await register(A, USER_A, 'Алиса');
  await register(B, USER_B, 'Боб');

  // 3. Смена имени (оба) и аватара (Алиса).
  await A.goto('/profile');
  await A.locator('.profile-fields .input').fill('Алиса Про');
  await A.getByRole('button', { name: 'Сохранить' }).click();
  await expect(A.getByRole('button', { name: /Сохранено/ })).toBeVisible();

  // 4. Аватар: файл → canvas-ресайз → сохранение → <img> вместо буквы.
  await A.locator('input[type=file]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });
  await expect(A.locator('img.avatar')).toBeVisible();

  await B.goto('/profile');
  await B.locator('.profile-fields .input').fill('Боб Про');
  await B.getByRole('button', { name: 'Сохранить' }).click();
  await expect(B.getByRole('button', { name: /Сохранено/ })).toBeVisible();

  // 5. Дружба: Алиса отправляет заявку, Боб принимает.
  await A.goto('/friends');
  await A.locator('.friend-add .input').fill(USER_B);
  await A.getByRole('button', { name: 'Отправить заявку' }).click();
  await expect(A.getByText(`@${USER_B}`)).toBeVisible();

  await B.goto('/friends');
  await B.getByRole('button', { name: 'Принять' }).click();
  await expect(B.locator('.friend-row .online-dot')).toBeVisible();

  // 6. Приглашение в онлайн-партию: Алиса зовёт, Боб принимает тост.
  await A.goto('/friends');
  await expect(A.locator('.online-dot.on')).toBeVisible(); // Боб в сети
  await A.getByRole('button', { name: /В игру/ }).click();

  await expect(B.locator('.invite-toast')).toBeVisible({ timeout: 10_000 });
  await B.locator('.invite-toast').getByRole('button', { name: 'Принять' }).click();

  await A.waitForURL('**/play/online/**', { timeout: 15_000 });
  await B.waitForURL('**/play/online/**', { timeout: 15_000 });
  await expect(A.locator('.board-svg')).toBeVisible();
  await expect(B.locator('.board-svg')).toBeVisible();

  // 7. Несколько ходов: чей ход — у того и появятся подсветки.
  let halfMoves = 0;
  for (let round = 0; round < 10 && halfMoves < 4; round++) {
    if (await makeMove(A)) halfMoves++;
    await A.waitForTimeout(400);
    if (await makeMove(B)) halfMoves++;
    await B.waitForTimeout(400);
  }
  expect(halfMoves).toBeGreaterThanOrEqual(4);

  // Синхронизация: у обоих одинаковое число записей в журнале ходов.
  await expect
    .poll(async () => ({
      a: await A.locator('.move-row').count(),
      b: await B.locator('.move-row').count(),
    }))
    .toEqual(expect.objectContaining({ a: Math.ceil(halfMoves / 2), b: Math.ceil(halfMoves / 2) }));

  // 8. Боб сдаётся (двухшаговое подтверждение).
  await B.getByRole('button', { name: 'Сдаться' }).click();
  await B.getByRole('button', { name: 'Точно сдаться?' }).click();

  await expect(A.locator('.gameover-modal')).toBeVisible({ timeout: 10_000 });
  await expect(B.locator('.gameover-modal')).toBeVisible({ timeout: 10_000 });
  await expect(A.locator('.gameover-reason')).toHaveText('Сдача');

  // 9. Статистика обновилась у обоих.
  await A.goto('/profile');
  await expect(A.locator('.stat-cell').first()).toContainText('1'); // победы
  await B.goto('/profile');
  await expect(B.locator('.stat-cell').nth(1)).toContainText('1'); // поражения

  await ctxA.close();
  await ctxB.close();
});
