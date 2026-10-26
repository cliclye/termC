// Each theme carries UI chrome tokens and an xterm palette.
const ansi = (a) => ({
  black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
  brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15],
});

export const BUILTIN_THEMES = [
  {
    id: 'termc-dark',
    name: 'TermC Dark',
    dark: true,
    ui: { bg: '#0e1014', panel: '#13161c', elevated: '#1a1e26', hover: '#1f242d', border: '#232833', text: '#d7dae0', muted: '#7d8590', accent: '#7c9cff', accentText: '#0e1014', success: '#7fd88f', warning: '#e5c07b', danger: '#f7768e' },
    term: {
      background: '#0e1014', foreground: '#d7dae0', cursor: '#7c9cff', cursorAccent: '#0e1014', selectionBackground: '#7c9cff40',
      ...ansi(['#1b1e25', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5', '#565f73', '#ff8ca0', '#b4e88a', '#f0c48a', '#9ab8ff', '#d0b4ff', '#a4e0ff', '#e6ebff']),
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    dark: true,
    ui: { bg: '#282a36', panel: '#21222c', elevated: '#303341', hover: '#343746', border: '#3a3d4d', text: '#f8f8f2', muted: '#8f93ad', accent: '#bd93f9', accentText: '#21222c', success: '#50fa7b', warning: '#f1fa8c', danger: '#ff5555' },
    term: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36', selectionBackground: '#44475a',
      ...ansi(['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff']),
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    dark: true,
    ui: { bg: '#2e3440', panel: '#292e39', elevated: '#353c4a', hover: '#3b4252', border: '#3b4252', text: '#e5e9f0', muted: '#8a93a6', accent: '#88c0d0', accentText: '#2e3440', success: '#a3be8c', warning: '#ebcb8b', danger: '#bf616a' },
    term: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', cursorAccent: '#2e3440', selectionBackground: '#434c5e',
      ...ansi(['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0', '#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']),
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    dark: true,
    ui: { bg: '#002b36', panel: '#00252e', elevated: '#073642', hover: '#0a3d4a', border: '#0d4250', text: '#93a1a1', muted: '#657b83', accent: '#268bd2', accentText: '#fdf6e3', success: '#859900', warning: '#b58900', danger: '#dc322f' },
    term: {
      background: '#002b36', foreground: '#839496', cursor: '#93a1a1', cursorAccent: '#002b36', selectionBackground: '#073642',
      ...ansi(['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#93a827', '#c9a227', '#4ea1e0', '#6c71c4', '#3fbdb2', '#fdf6e3']),
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    dark: false,
    ui: { bg: '#fdf6e3', panel: '#f5eedb', elevated: '#eee8d5', hover: '#e8e1cc', border: '#e0d9c4', text: '#586e75', muted: '#93a1a1', accent: '#268bd2', accentText: '#fdf6e3', success: '#859900', warning: '#b58900', danger: '#dc322f' },
    term: {
      background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', cursorAccent: '#fdf6e3', selectionBackground: '#eee8d5',
      ...ansi(['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#6c7c00', '#8f6c00', '#1f6fa8', '#6c71c4', '#1f8a82', '#93a1a1']),
    },
  },
];

export function applyUiTheme(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.ui)) root.style.setProperty(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, v);
  root.dataset.mode = theme.dark ? 'dark' : 'light';
}
