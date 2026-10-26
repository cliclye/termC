const ansi = (a) => ({ black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7], brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15] });
const theme = (id, name, dark, ui, bg, fg, cursor, sel, palette) => ({ id, name, dark, ui, term: { background: bg, foreground: fg, cursor, cursorAccent: bg, selectionBackground: sel, ...ansi(palette) } });

const themes = [
  theme('tokyo-night', 'Tokyo Night', true,
    { bg: '#1a1b26', panel: '#16161e', elevated: '#1f2335', hover: '#24283b', border: '#292e42', text: '#c0caf5', muted: '#737aa2', accent: '#7aa2f7', accentText: '#16161e', success: '#9ece6a', warning: '#e0af68', danger: '#f7768e' },
    '#1a1b26', '#c0caf5', '#c0caf5', '#33467c', ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6', '#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5']),
  theme('catppuccin-mocha', 'Catppuccin Mocha', true,
    { bg: '#1e1e2e', panel: '#181825', elevated: '#26263a', hover: '#313244', border: '#313244', text: '#cdd6f4', muted: '#7f849c', accent: '#cba6f7', accentText: '#11111b', success: '#a6e3a1', warning: '#f9e2af', danger: '#f38ba8' },
    '#1e1e2e', '#cdd6f4', '#f5e0dc', '#45475a', ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de', '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']),
  theme('gruvbox-dark', 'Gruvbox Dark', true,
    { bg: '#282828', panel: '#1d2021', elevated: '#32302f', hover: '#3c3836', border: '#3c3836', text: '#ebdbb2', muted: '#928374', accent: '#fabd2f', accentText: '#1d2021', success: '#b8bb26', warning: '#fabd2f', danger: '#fb4934' },
    '#282828', '#ebdbb2', '#ebdbb2', '#504945', ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2']),
  theme('one-dark', 'One Dark', true,
    { bg: '#282c34', panel: '#21252b', elevated: '#2c313a', hover: '#323842', border: '#353b45', text: '#abb2bf', muted: '#7f848e', accent: '#61afef', accentText: '#21252b', success: '#98c379', warning: '#e5c07b', danger: '#e06c75' },
    '#282c34', '#abb2bf', '#528bff', '#3e4451', ['#282c34', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf', '#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff']),
  theme('github-light', 'GitHub Light', false,
    { bg: '#ffffff', panel: '#f6f8fa', elevated: '#ffffff', hover: '#eaeef2', border: '#d0d7de', text: '#1f2328', muted: '#656d76', accent: '#0969da', accentText: '#ffffff', success: '#1a7f37', warning: '#9a6700', danger: '#cf222e' },
    '#ffffff', '#1f2328', '#0969da', '#b6e3ff', ['#24292f', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781', '#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f']),
];

for (const t of themes) termc.themes.register(t);
