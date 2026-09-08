// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
//
// Every extension in this repository BUILDS, PACKS, and LOADS.
//
// Nothing else covers those three. A typecheck sees the source and never the
// bundle, so it cannot see an import the preset failed to rewrite, a manifest
// the packer would refuse, or a hook the manifest promises and nobody
// registers — and each of those is a bundle that installs and then does
// nothing, in someone else's app, with no error anywhere.
//
// The kernel here is a stub: enough of `globalThis.__polo` for the bundle to
// evaluate and hand over its registrations. It is not the host, so this proves
// the bundle LOADS rather than that it scores correctly — the rules are the
// engine's own tests' business.

import assert from "node:assert/strict"
import { readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createContext, runInContext } from "node:vm"

import { build } from "esbuild"
// @ts-expect-error — the toolchain is deliberately plain JS and ships no types.
import { buildExtension } from "@ham2k/extension-tools"
// @ts-expect-error — as above.
import { findSharedModuleReferences, pack, validateManifest } from "@ham2k/extension-tools/format"

const extensionsDir = dirname(fileURLToPath(import.meta.url))

/// The libraries the host hands every extension, stubbed down to what a bundle
/// touches while its modules INITIALIZE — the country file the SDK's `dxcc`
/// module registers on import, and the mode tables its `modes` module builds a
/// set from. Everything else is read from inside a hook, which this test never
/// runs.
///
/// Deliberately not a Proxy answering everything: esbuild's CJS interop copies
/// a module's own property names once, at import, so a Proxy would hand the
/// bundle an EMPTY namespace and every failure would arrive as `undefined is
/// not a function` far from here.
function stubSharedModules(): Record<string, Record<string, unknown>> {
  return {
    "@ham2k/lib-callsigns": { parseCallsign: (call: string) => ({ call }) },
    "@ham2k/lib-country-files": {
      useBuiltinCountryFile: () => {},
      annotateFromCountryFile: (info: unknown) => info,
    },
    "@ham2k/lib-dxcc-data": { CONTINENTS: {}, DXCC_BY_CODE: {}, DXCC_BY_PREFIX: {} },
    "@ham2k/lib-format-tools": {},
    "@ham2k/lib-geo-tools": {},
    "@ham2k/lib-operation-data": {
      ADIF_MODES_AND_SUBMODES: [],
      ADIF_SUBMODES_BY_MODE: {},
      MODES: [],
      superModeForMode: (mode: string) => mode,
    },
    "@ham2k/lib-qson-cabrillo": {},
    "i18next": { default: {}, createInstance: () => ({}) },
    "liquidjs": { Liquid: class {} },
  }
}

interface Registration {
  category: string
  key: string
  hook: Record<string, unknown>
}

/// Evaluates a built bundle against a stub kernel and answers what it
/// registered. A fresh context per bundle, because two extensions loaded into
/// one would share the SDK's module-level state and the second could read as
/// working on the strength of the first.
function loadBundle(source: string): { definition: Record<string, unknown>; registrations: Registration[] } {
  const registrations: Registration[] = []
  let definition: Record<string, unknown> | undefined

  const sandbox: Record<string, unknown> = {}
  sandbox.globalThis = sandbox
  sandbox.__polo = {
    sharedModules: stubSharedModules(),
    defineExtension(def: Record<string, unknown>) {
      definition = def
      const onActivation = def.onActivation as (api: unknown) => void
      onActivation({
        registerHook(category: string, { hook, key }: { hook: Record<string, unknown>; key: string }) {
          registrations.push({ category, key, hook })
        },
      })
    },
  }

  runInContext(source, createContext(sandbox))

  assert.ok(definition, "the bundle evaluated without ever calling defineExtension")
  return { definition, registrations }
}

async function extensionDirs(): Promise<string[]> {
  const entries = await readdir(extensionsDir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
}

test("every extension builds, packs and loads", async (t) => {
  const dirs = await extensionDirs()
  // Discovered, not restated: an extension added and never listed here would be
  // one nobody builds, which is the state this test exists to end.
  assert.ok(dirs.length >= 3, `expected the extensions to be here, found ${dirs.join(", ") || "none"}`)

  for (const name of dirs) {
    await t.test(name, async () => {
      const dir = join(extensionsDir, name)
      const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"))

      // `forceName` waives the callsign-prefix rule and NOTHING else — the same
      // waiver `h2kext-pack --force-name` applies, and the only reason a
      // `ham2k-` key is allowed to pack at all.
      assert.deepEqual(validateManifest(manifest, { forceName: true }), [], `${name}'s manifest would not pack`)

      const { outDir } = await buildExtension(build, { dir, logLevel: "silent" })
      const bundle = await readFile(join(outDir, "index.js"), "utf8")

      // The sandbox evaluates a script and has no module loader, so a bundle
      // that kept an `import` is one that loads and then does nothing.
      assert.doesNotMatch(bundle, /^import\s/m, `${name} built with imports left in it`)

      // Everything it takes from the host, it declared. The host version-checks
      // what a bundle declares before loading it; an undeclared lookup is one
      // it cannot check, and it dies at the first call instead.
      const declared = Object.keys(manifest.sharedDependencies ?? {})
      for (const used of findSharedModuleReferences(bundle) as string[]) {
        assert.ok(declared.includes(used), `${name} reaches ${used} without declaring it`)
      }

      // Packed into a temp file: the real archive, refused for the real reasons,
      // without leaving a `.h2kext` beside the source for the next release to
      // pick up.
      const outPath = join(await tempDir(), `${manifest.key}-${manifest.version}.h2kext`)
      const packed = await pack(outDir, { outPath, forceName: true })
      assert.equal(packed.manifest.key, manifest.key)
      await rm(dirname(outPath), { recursive: true, force: true })

      const { definition, registrations } = loadBundle(bundle)
      assert.equal(definition.key, manifest.key)

      // What the manifest PROMISES is what the bundle registers, both ways. The
      // panel and the catalog read this list without loading anything, so a
      // promise nobody keeps is an extension the operator is told does
      // something it does not — and a hook registered off the list is one the
      // app was never told to expect.
      assert.deepEqual(
        registrations.map((r) => r.category).sort(),
        [...(manifest.hooks as string[])].sort(),
        `${name}'s manifest.hooks and its registrations disagree`,
      )

      // Every hook under the extension's own key, which is what the app shows
      // when it says where a hook came from.
      for (const registration of registrations) {
        assert.equal(registration.key, manifest.key, `${registration.category} registered under another key`)
      }

      // The ref handler's category names a ref TYPE, and the scorer is scoped to
      // that same type. The two disagreeing is a scoreboard that stays at zero
      // for an operation whose ref is right there — and each half looks correct
      // on its own.
      const refCategories = registrations.map((r) => r.category).filter((c) => c.startsWith("ref:"))
      assert.equal(refCategories.length, 1, `${name} registers ${refCategories.length} ref handlers`)
      const refType = refCategories[0]!.slice("ref:".length)
      const scoring = registrations.find((r) => r.category === "scoring")
      assert.ok(scoring, `${name} registers no scorer`)
      // Spread first: the scope came out of the vm realm, and an array from
      // another realm is never deep-STRICT-equal to one built here.
      assert.deepEqual([...(scoring.hook.scope as { refTypes: string[] }).refTypes], [refType])
    })
  }
})

async function tempDir(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises")
  return mkdtemp(join(tmpdir(), "h2kext-bundle-"))
}
