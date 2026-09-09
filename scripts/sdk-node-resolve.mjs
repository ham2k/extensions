// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Makes `@ham2k/extension-sdk`'s published `dist/` loadable by NODE, so an
// extension's unit tests can import the same modules its bundle does.
//
// The SDK ships a bundler-only dist: its barrel re-exports `./types` with no
// file extension, and its catalogs import `.json` with no import attribute.
// esbuild resolves both, which is why every bundle here builds; Node resolves
// neither, and refuses the package outright at `ERR_MODULE_NOT_FOUND
// .../dist/types`. Without this, no test may import anything that reaches the
// SDK — which is most of what a ported extension's testable code does.
//
// Scoped to that one package's dist and to nothing else, so a repository
// module with a genuinely wrong specifier still fails as it should.
//
// Delete this the day the SDK publishes a Node-resolvable dist; `npm test`
// says so immediately, because the scripts naming it stop finding it.

import { registerHooks } from "node:module"

const SDK_DIST = "/@ham2k/extension-sdk/dist/"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith(".") || !(context.parentURL ?? "").includes(SDK_DIST)) {
      return nextResolve(specifier, context)
    }
    if (specifier.endsWith(".json")) {
      const resolved = nextResolve(specifier, context)
      return { ...resolved, importAttributes: { type: "json" } }
    }
    if (!specifier.endsWith(".js")) return nextResolve(`${specifier}.js`, context)
    return nextResolve(specifier, context)
  },
})
