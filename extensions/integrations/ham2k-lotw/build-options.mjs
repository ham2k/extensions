// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// The esbuild settings Forge needs inside the sandbox, beyond the preset's.
// `build.mjs` and the repository's bundle test both build with them, so the
// test loads the bundle that is published.
//
// - Forge reaches for Node's `crypto` when it finds one. The neutral preset
//   ignores Forge's browser map, so that import is answered here, for Forge's
//   own files only, with a module that throws: signing takes its entropy from
//   `host.randomBytes`, never from a Node source.
// - Forge reads `self` for its globals; the sandbox has `globalThis` and no
//   DOM.

const forgeSandbox = {
  name: 'forge-sandbox',
  setup(builder) {
    builder.onResolve({ filter: /^crypto$/ }, ({ importer }) => {
      if (/(?:^|[/\\])node-forge[/\\]lib[/\\]/.test(importer)) {
        return { path: 'crypto', namespace: 'forge-sandbox' }
      }
    })
    builder.onLoad({ filter: /^crypto$/, namespace: 'forge-sandbox' }, () => ({
      contents: 'throw new Error("Forge cannot use Node crypto inside HaLo")',
      loader: 'js',
    }))
  },
}

export default {
  plugins: [forgeSandbox],
  define: { self: 'globalThis' },
}
