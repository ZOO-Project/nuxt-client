// Compatibility shim for `next-auth/core`.
//
// @sidebase/nuxt-auth 0.9 imports `next-auth/core`, a subpath that next-auth stopped listing in
// its package exports in 4.22 although the file is still shipped. The patched 4.24.x releases
// are needed for several advisories, so the module is loaded at runtime from the installed
// package with an absolute path, which the exports map does not restrict. `nuxt.config.ts`
// aliases `next-auth/core` to this file for the server build.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
// Locate the package through a subpath that the server bundle already uses (`next-auth/jwt`):
// Nitro only copies the traced files of the package, not its main entry.
const core = require(join(dirname(require.resolve('next-auth/jwt')), '..', 'core', 'index.js'))

export const AuthHandler = core.AuthHandler
export default core
