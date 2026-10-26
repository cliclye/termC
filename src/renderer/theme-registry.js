import { BUILTIN_THEMES, applyUiTheme } from './themes';
import { getState } from './store';

export function allThemes(s = getState()) {
  return [...BUILTIN_THEMES, ...Object.values(s.plugin.themes)];
}

export function currentTheme(s = getState()) {
  const id = s.settings?.theme;
  return allThemes(s).find((t) => t.id === id) || BUILTIN_THEMES[0];
}

export function applyCurrentTheme() {
  applyUiTheme(currentTheme());
}
