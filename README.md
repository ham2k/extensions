# Ham2K Extensions

Official Ham2K Logger extensions that ship on their own, published to
[catalog.ham2k.net](https://catalog.ham2k.net) rather than bundled with the app.

An extension here is a standalone npm workspace: a manifest, some source, and
whatever shared library it leans on. It is built into a single bundle against
[`@ham2k/extension-sdk`](https://www.npmjs.com/package/@ham2k/extension-sdk),
uploaded to the catalog, and installed by operators who want it — so it ships,
and updates, without an app release.

## Layout

- `packages/*` — shared libraries several extensions use. `@ham2k/lib-qso-party`
  is the QSO-party engine: one scorer, exchange field and Cabrillo writer that
  every state, provincial and regional party's extension hands its own rules to.
- `extensions/*` — one directory per published extension.

## Working on one

Node 24, ESM, TypeScript. Tests run straight off the source, with no bundler:

```sh
npm install
npm test                       # every workspace
npm test -w @ham2k/lib-qso-party
npm run typecheck              # the whole tree
npm run build                  # bundles each extension
npm run pack                   # the artifacts the catalog serves
```

`npm test` runs `node --experimental-strip-types --test`, which strips the
types and runs the `.ts` files as they are. Imports therefore name the `.ts`
file they mean — `./params.ts`, not `./params.js`.

## License

MPL-2.0, as the app and the SDK are.
