import colors from 'tailwindcss/colors.js';
import plugin from 'tailwindcss/plugin.js';

// Tailwind shades are reused across the app. Keep backgrounds, text, and
// borders independent so darkening a card never darkens the text on it.
const primary = {
  50: '#f6f8fa', 100: '#f8f9fa', 200: '#e5e7eb', 300: '#e2e8f0',
  400: '#5c6e83', 500: '#52647a', 600: '#47596f', 700: '#475569',
  800: '#334155', 900: '#1f2937', 950: '#111827',
};
const darkInk = {
  50: '#ffffff', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
  400: '#aab9ca', 500: '#a2b1c4', 600: '#bac8d8', 700: '#cbd5e1',
  800: '#d8e2ee', 900: '#e7eef7', 950: '#f1f5f9',
};
const lightSurface = {
  50: primary[50], 100: primary[100], 200: primary[200], 300: primary[300],
  400: '#cbd5e1', 500: '#94a3b8', 600: '#64748b', 700: primary[700],
  800: primary[800], 900: primary[900], 950: primary[950],
};
const darkSurface = {
  50: '#151922', 100: '#0f1117', 200: '#222b3a', 300: '#30394a',
  400: '#49576b', 500: '#64748b', 600: '#465671', 700: '#354459',
  800: '#29374e', 900: '#1d283b', 950: '#111827',
};
const darkBorder = {
  50: '#30394a', 100: '#30394a', 200: '#394459', 300: '#53627a',
  400: '#687c96', 500: '#7387a1', 600: '#63738c', 700: '#4a5971',
  800: '#40516c', 900: '#34435c', 950: '#243148',
};
const accent = { primary: '#1e3a8a', secondary: '#0f172a', blue: '#1d4ed8', blueDark: '#1e3a8a', info: '#1d4ed8', danger: '#dc2626', success: '#10b981', warning: '#f59e0b' };
const darkAccentInk = { primary: '#9bb7ff', blue: '#95b6ff', blueDark: '#b0c5ff', info: '#95b6ff', danger: '#ff9c9d', success: '#6ee7b7', warning: '#fcd34d' };
const families = {
  slate: ['#171f2e', '#202b3b', '#2c394d', '#52637d'],
  gray: ['#191f2b', '#222b39', '#303a49', '#55637a'],
  zinc: ['#1b202b', '#252c38', '#333c49', '#5b6576'],
  neutral: ['#1c222c', '#262e39', '#343e4d', '#586377'],
  stone: ['#22222a', '#2d2c35', '#3a3742', '#645d6c'],
  blue: ['#182742', '#20324f', '#293e60', '#5276ae'],
  sky: ['#152a3c', '#1b344b', '#23445d', '#477fa4'],
  indigo: ['#212543', '#2a3051', '#343c64', '#6877b8'],
  violet: ['#282244', '#37294f', '#453363', '#8570b1'],
  purple: ['#2e2343', '#3b2a50', '#4a3561', '#966eae'],
  red: ['#382029', '#482732', '#572e39', '#a75c6c'],
  rose: ['#39202e', '#482639', '#572e48', '#ab607f'],
  pink: ['#382237', '#462b44', '#573551', '#ab6999'],
  orange: ['#372820', '#463127', '#583e31', '#a47154'],
  amber: ['#34291b', '#44351f', '#55412a', '#a5804b'],
  yellow: ['#312b1c', '#403724', '#51462f', '#9a8850'],
  lime: ['#232d1c', '#303a23', '#3a4a2b', '#748d51'],
  green: ['#192f26', '#213e32', '#2a4c3d', '#598e74'],
  emerald: ['#16302a', '#1c3d34', '#274c41', '#518c78'],
  teal: ['#163030', '#1d3d40', '#264c50', '#52918f'],
  cyan: ['#172e39', '#1c3a47', '#254957', '#55899e'],
};
const neutralFamilies = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);
const rgb = (hex) => hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16)).join(' ');
const light = {};
const dark = {};
function color(role, name, lightValue, darkValue) {
  const token = `--ui-${role}-${name}`;
  light[token] = rgb(lightValue);
  dark[token] = rgb(darkValue);
  return `rgb(var(${token}) / <alpha-value>)`;
}
function shades(role, family, lightValues, darkValues) {
  return Object.fromEntries(Object.entries(darkValues).map(([shade, value]) =>
    [shade, color(role, `${family}-${shade}`, lightValues[shade], value)]));
}

const text = { primary: shades('text', 'primary', primary, darkInk) };
const background = {
  white: color('bg', 'white', '#ffffff', '#1b2230'),
  primary: shades('bg', 'primary', lightSurface, darkSurface),
};
const border = { primary: shades('border', 'primary', lightSurface, darkBorder) };
text.accent = Object.fromEntries(Object.entries(darkAccentInk).map(([name, value]) =>
  [name, color('text', `accent-${name}`, name === 'success' ? '#047857' : accent[name], value)]));
background.accent = { primary: color('bg', 'accent-primary', accent.primary, '#294db2'), blue: color('bg', 'accent-blue', accent.blue, '#3763cf') };

for (const [family, [soft, selected, high, outline]] of Object.entries(families)) {
  const swatches = colors[family];
  background[family] = shades('bg', family, swatches, { 50: soft, 100: selected, 200: high });
  border[family] = shades('border', family, swatches, { 50: soft, 100: high, 200: outline, 300: outline, 400: neutralFamilies.has(family) ? '#7588a1' : swatches[400] });
  // Low-number foreground shades are already intentionally light, usually
  // for imagery or a solid brand button. Only adapt dark/mid foregrounds.
  text[family] = shades('text', family, swatches, neutralFamilies.has(family)
    ? { 400: '#aab9ca', 500: '#a2b1c4', 600: '#bac8d8', 700: '#cbd5e1', 800: '#d8e2ee', 900: '#e7eef7', 950: '#f1f5f9' }
    : { 500: swatches[300], 600: swatches[300], 700: swatches[200], 800: swatches[200], 900: swatches[100], 950: swatches[100] });
}

const focus = color('ring', 'accent-blue', accent.blue, '#91b3ff');
export const themeColors = {
  colors: { primary: lightSurface, accent },
  textColor: text,
  placeholderColor: text,
  backgroundColor: background,
  gradientColorStops: background,
  borderColor: border,
  divideColor: border,
  ringColor: { ...border, accent: { primary: focus, blue: focus } },
  ringOffsetColor: { white: background.white },
};

export const themePalette = plugin(({ addBase }) => {
  addBase({
    ':root': light,
    '@media screen': { ':root[data-theme="dark"]': dark },
  });
});
