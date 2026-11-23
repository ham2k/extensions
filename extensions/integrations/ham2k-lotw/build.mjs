// Copyright © 2026 Robert Jackson
// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// Builds this extension the way any third party builds one — see the
// repository README — with the settings in `build-options.mjs`. The licences
// of the code it bundles travel in `assets/`, which the packer carries from
// `build/assets/`.
//
//   node build.mjs && npx h2kext-pack build --force-name

import { cp } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'
import { buildExtension } from '@ham2k/extension-tools'
import options from './build-options.mjs'

export const { outDir } = await buildExtension(build, { dir: import.meta.dirname, ...options })
await cp(join(import.meta.dirname, 'assets'), join(outDir, 'assets'), { recursive: true })

console.log('built', outDir)
