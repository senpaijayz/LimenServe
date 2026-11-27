import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Keep palette tokens for generated utilities and handwritten styles only.
// Route CSS files use the shared semantic aliases declared in index.css.
const prunePalette = {
  postcssPlugin: 'limen-prune-palette',
  OnceExit(root) {
    const used = new Set();
    root.walkDecls((declaration) => {
      for (const match of declaration.value.matchAll(/var\((--ui-[\w-]+)/g)) used.add(match[1]);
    });
    root.walkDecls(/^--ui-/, (declaration) => {
      if (!used.has(declaration.prop)) declaration.remove();
    });
  },
};

export default { plugins: [tailwindcss(), autoprefixer(), prunePalette] };
