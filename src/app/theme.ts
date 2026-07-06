/** Цветовые темы доски (светлая/тёмная клетка). */

export interface BoardTheme {
  id: string;
  label: string;
  labelEn: string;
  light: string;
  dark: string;
}

export const THEMES: BoardTheme[] = [
  { id: 'brown', label: 'Классическая', labelEn: 'Classic', light: '#f0d9b5', dark: '#b58863' },
  { id: 'green', label: 'Зелёная', labelEn: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'blue', label: 'Синяя', labelEn: 'Blue', light: '#dbe6ef', dark: '#6b8bb5' },
  { id: 'gray', label: 'Серая', labelEn: 'Gray', light: '#ececec', dark: '#9aa0a6' },
];

export function themeById(id: string): BoardTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
