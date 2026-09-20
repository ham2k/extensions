// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
// Run external-panel integration tests through HaLo's normal test gate.
import { mkdir, copyFile, rm, access, realpath } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const input = process.argv[2]
if (!input) throw new Error('Usage: node scripts/test-svg-host.mjs /path/to/halo')
const halo = await realpath(input), root = resolve(import.meta.dirname, '..')
for (const key of ['ki2d-weather-panel', 'ki2d-solar-panel', 'ki2d-radio-panel']) await access(join(root, 'extensions/dashboard', key, 'build/index.js'))
await access(join(halo, 'scripts/test.sh'))
const group = `external_svg_panels_${process.pid}`, dir = join(halo, 'app/test', group)
await mkdir(dir) // Never overwrite somebody else's files.
try {
  await copyFile(join(root, 'tests/halo/svg_panels_test.dart'), join(dir, 'svg_panels_test.dart'))
  const result = spawnSync('./scripts/test.sh', [group], {
    cwd: halo, stdio: 'inherit',
    env: { ...process.env, SVG_PANEL_BUNDLES: join(root, 'extensions/dashboard') },
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  await rm(dir, { recursive: true })
}
