# Ham2K Extensions

Official Ham2K Logger extensions that ship on their own, published to
[catalog.ham2k.net](https://catalog.ham2k.net) rather than bundled with the app.

An extension here is a standalone npm workspace: a manifest, some source, and
whatever shared library it leans on. It is built into a single bundle against
[`@ham2k/extension-sdk`](https://www.npmjs.com/package/@ham2k/extension-sdk),
uploaded to the catalog, and installed by operators who want it — so it ships,
and updates, without an app release.

The first thing living here is the QSO parties. The app carries one `qp`
extension holding all fifty; this repository publishes them **one event per
extension**, so an operator installs the Texas QSO Party and gets the Texas QSO
Party.

## Layout

- `packages/*` — shared libraries several extensions use.
  - `@ham2k/lib-qso-party` — the QSO-party engine. One scorer, one exchange
    field, one Cabrillo writer and one setup form, built from the
    `QsoPartyParams` a party hands it. Every rule a sponsor can state is an
    option or a table there; nothing about a particular party lives in code.
  - `@ham2k/qso-parties` — every party's rules, counties and dates as
    `QsoPartyParams`, one module per event, **generated** from the sponsors'
    own files. Edit a fixture and re-run the generator; never edit a module.
- `extensions/*` — one directory per published extension.
- `extensions/bundles.test.ts` — builds, packs and loads every extension. It
  belongs to no workspace, so the root `npm test` names it directly.
- `scripts/convert-parties.mjs` — the party generator.

## Adding an event

Everything specific to one QSO party is data. Adding one is:

1. Make sure `packages/qso-parties` has it — `src/parties/<code>.ts`, generated
   from `fixtures/<code>.json`. If the sponsor has published a new season, drop
   the updated files in and run `node scripts/convert-parties.mjs <dir>`; the
   diff is reviewable and the differential test says what changed.
2. `mkdir extensions/ham2k-<event-name>` with four files, copied from an
   existing event — the three here differ only in identity and in which party
   they import:
   - `manifest.json` — key, name, `shortName`, version, description,
     `category: "contest"`, `api: 1`, icon, accent, keywords, `hooks`, `geo`,
     `sharedDependencies`, and any `translations`. **`hooks` must list exactly
     what the code registers, `ref:<refType>` included** — the panel and the
     catalog read that list without loading anything, and `bundles.test.ts`
     holds the two to each other.
   - `package.json` — a private workspace with `build`, `typecheck` and `pack`.
   - `build.mjs` — `buildExtension(build, { dir: import.meta.dirname })`.
   - `src/index.ts` — `defineQsoParty(PARTY)` and five `registerHook` calls.
3. `npm install` (a new workspace has to reach the root lock), then `npm test`.

The `icon` is **per event**, and the two here are only defaults: `star-box` for
a QSO party, `leaf-maple` for a Canadian one. They live in the manifest so that
any event can be given its own without touching the engine or its party data —
which is where a sponsor's own glyph would go. The engine falls back to
`star-box` for a party whose manifest names none. Both are
[MDI](https://pictogrammers.com/library/mdi/) names, and the app renders only
what its codepoint table carries, so check a new one against
`packages/halo_widgets/lib/src/icon_codepoints.g.dart` before using it.

`geo` is worth a moment. It **ranks** an extension in the catalog and in the
Extensions panel for the operator's own callsign; nothing is hidden by it.
These three declare `{"countries": ["us", "ca"]}` rather than
`{"entities": ["K", "VE"]}`, because the DXCC entity `K` is the lower 48:
Alaska is `KL` and Hawaii is `KH6`, and an operator in either is a prime
multiplier in every one of these events rather than someone to rank it away
from. The ISO country the app derives for `KL` and `KH6` is `us`, so
`countries` says what was meant. Canada is in the list because Canadian
stations work the US parties and the other way round.

## Building and packing

Node 24, ESM, TypeScript.

```sh
npm install
npm test                       # every workspace, then every bundle
npm test -w @ham2k/lib-qso-party
npm run typecheck              # the whole tree
npm run build                  # bundles each extension into its build/
npm run pack                   # builds, then writes each <key>-<version>.h2kext
```

`npm test` runs `node --experimental-strip-types --test`, which strips the
types and runs the `.ts` files as they are. Imports therefore name the `.ts`
file they mean — `./params.ts`, not `./params.js`.

`npm run pack` passes `--force-name`, which is what a `ham2k-` key needs; see
below.

## Bundle sizes, and why they are what they are

Built as they are today, unminified, through the same preset the app's own
extensions use:

| bundle | `index.js` | `.h2kext` |
|---|---:|---:|
| `ham2k-texas-qso-party` | 137,748 | 37,916 |
| `ham2k-canadian-prairies-qso-party` | 136,676 | 37,167 |
| `ham2k-7th-call-area-qso-party` | 144,010 | 39,685 |
| **three events** | **418,434** | **114,768** |
| the app's own `qp.js`, all fifty parties | 318,890 | — |

Three events cost more than fifty do inside the app, and the reason is worth
stating plainly rather than discovering later. Texas breaks down as:

| | bytes |
|---|---:|
| `@ham2k/extension-sdk` | 65,969 |
| `@ham2k/lib-qso-party` — the engine | 57,697 |
| the party itself — 254 counties, its options and its dates | 6,004 |
| this extension's own code | 3,842 |
| esbuild's runtime and its IIFE wrapper | 4,236 |

**The event is 4% of its own bundle.** The other 96% is code every party's
bundle carries an identical copy of, because the app is untouched by this work:
the host offers a fixed list of shared libraries, the engine is not on that
list, so each bundle brings its own. Making `@ham2k/lib-qso-party` a host
shared module — the same mechanism `@ham2k/lib-qson-cabrillo` and the rest
already go through — takes each of these to roughly ten kilobytes, and is what
makes fifty separate extensions cheaper than one extension holding fifty
parties. Until then, an operator who installs three pays for three engines.

## The `ham2k-` prefix, and what it means for testing

These keys are Ham2K's own, and the app treats them differently from anyone
else's:

- **The packer refuses a `ham2k-` key** unless given `--force-name`. Each
  extension's `pack` script passes it; that is the only reason these package at
  all.
- **The app refuses a `ham2k-` key on install** — with one waiver, and it is
  narrow. A bundle that arrived from `catalog.ham2k.net`, over bytes that
  hashed to the sha256 the listing gave, is recorded as having come from there,
  and the prefix rule is waived on every read for that key. Uninstalling it, or
  installing the same key from a file, clears the record and the waiver with
  it. A key the app itself ships stays refused whatever the catalog says.

So **these bundles cannot be side-loaded for hand testing as they are.**
Installing one from a file, or from a deep link naming any host but the
catalog, is refused before the zip is opened. Trying one on a device means
publishing it to the catalog, or building it under a key that is not `ham2k-`.

## Open, and load-bearing

**The host must carry `@ham2k/lib-qson-cabrillo` 1.2.0 or newer.** That release
added the Cabrillo *writer* the engine calls; 1.1.0 and earlier read Cabrillo
and cannot write it. Every manifest here declares `^1.2.0`, and the host checks
a declared range against the copy it actually holds — so an app built against
an older one refuses these bundles by name and version rather than failing at
the moment someone exports a log. The app's own `extensions/package.json` is
where that floor is raised.

## License

MIT — see [LICENSE.md](LICENSE.md). The app and the SDK are MPL-2.0; this repo
is deliberately the looser of the two, so that an event's own club can take
what is here and publish under its own name without inheriting a copyleft
obligation from us.
