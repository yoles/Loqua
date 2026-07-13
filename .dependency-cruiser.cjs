/** Garde-fou d'architecture (ARCHITECTURE §5) — la flèche pointe toujours vers core. */
module.exports = {
  forbidden: [
    {
      name: 'core-n-importe-personne',
      severity: 'error',
      comment:
        "Le core est du TS pur : jamais d'adapter, d'app, de framework, de lib externe ni d'API plateforme",
      from: { path: '^packages/core/src', pathNot: '\\.test\\.ts$' },
      to: { pathNot: '^packages/core/src' },
    },
    {
      name: 'adapters-web-navigateur-pur',
      severity: 'error',
      comment:
        'Le code de prod des adapters web ne touche jamais une API Node (node:sqlite = tests uniquement)',
      from: { path: '^packages/adapters-web/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^node:' },
    },
    {
      name: 'adapters-tauri-webview-pur',
      severity: 'error',
      comment:
        "Les adapters Tauri vivent dans la webview : jamais d'API Node (le natif vit côté Rust)",
      from: { path: '^packages/adapters-tauri/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^node:' },
    },
    {
      name: 'ui-web-sans-adapter',
      severity: 'error',
      comment: "ui-web n'importe jamais un adapter (l'injection se fait au composition root)",
      from: { path: '^packages/ui-web' },
      to: { path: '^packages/adapters-' },
    },
    {
      name: 'packages-sans-app',
      severity: 'error',
      comment: "Un package ne dépend jamais d'une app ou d'un service (inversion interdite)",
      from: { path: '^packages/' },
      to: { path: '^(apps|services)/' },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      comment: 'Aucune dépendance circulaire',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
};
