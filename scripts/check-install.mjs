// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Stops `npm test` and `npm run typecheck` when node_modules does not hold what
// package-lock.json names. Without it, a checkout installed before a dependency
// was added fails somewhere inside an extension's tests, with a missing module
// or a missing build, and reads as a code error rather than a stale install;
// and one installed before a dependency was dropped still imports it, so the
// gate passes a tree a fresh clone fails.
//
// The root scripts call it by name rather than as a `pre` hook: npm skips
// every hook under `ignore-scripts`, and nothing would say so.
//
// - Each package the lockfile places under a node_modules/ directory is there
//   at the locked version, as a directory of its own: a symlink there is an
//   `npm link`, which reads the version of whatever it points at.
// - Optional ones may be absent: npm skips those that do not fit this machine,
//   such as the other platforms' binaries.
// - A workspace link points at the workspace the lockfile names. A worktree
//   whose node_modules is the main checkout's resolves every workspace to the
//   main checkout's copy, and would test that instead of its own.
// - Nothing sits at the top of node_modules that the lockfile does not name.

import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))

const problems = []
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/')) continue
  const dir = join(root, path)
  try {
    if (entry.link) {
      const [target, workspace] = await Promise.all([realpath(dir), realpath(join(root, entry.resolved))])
      if (target !== workspace) problems.push(`${path} points at ${target}, the lockfile says ${entry.resolved}`)
      continue
    }
    if ((await lstat(dir)).isSymbolicLink()) {
      problems.push(`${path} is a link, the lockfile installs it`)
      continue
    }
    let version
    try {
      ;({ version } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')))
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      problems.push(`${path}/package.json is unreadable`)
      continue
    }
    if (version !== entry.version) problems.push(`${path} is ${version}, the lockfile says ${entry.version}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if (!entry.optional) problems.push(`${path} is missing`)
  }
}

const top = join(root, 'node_modules')
try {
  for (const name of await readdir(top)) {
    if (name.startsWith('.')) continue
    const names = name.startsWith('@') ? (await readdir(join(top, name))).map((scoped) => `${name}/${scoped}`) : [name]
    for (const found of names) {
      if (!(`node_modules/${found}` in lock.packages)) problems.push(`node_modules/${found} is not in the lockfile`)
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

if (problems.length) {
  const shown = problems.slice(0, 5)
  if (problems.length > shown.length) shown.push(`…and ${problems.length - shown.length} more`)
  console.error(`node_modules does not match package-lock.json:\n  ${shown.join('\n  ')}\nRun \`npm ci\`, then try again.`)
  process.exit(1)
}
