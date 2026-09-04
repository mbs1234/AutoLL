/**
 * Stub for the private `diu` module.
 *
 * Upstream BG1 never publishes this module -- `.gitignore` excludes
 * `src/api/diu`, and upstream's build script (`rm -f src/api/diu.ts &&
 * vite build`) deletes the public shim so a private implementation resolves
 * in its place. A clean clone of `mickey` therefore cannot resolve
 * `import('../diu')` and the build fails. This stub restores a buildable
 * tree.
 *
 * The real module supplies Disney's `disneyInternalUse01..03` request fields,
 * which look like device/session fingerprinting values.
 *
 * Scope of this stub: only Disneyland calls it (`src/api/ll/dlr.ts` -- both
 * the preload on offer generation and the spread in `book()`). Walt Disney
 * World's booking path never imports it, so returning nothing leaves WDW
 * Lightning Lane fully functional and degrades only DLR booking, which is
 * already broken upstream (see commit 3eaf2a4, "LL booking doesn't work at
 * DLR anymore either").
 *
 * Use `npm run build:fork` to build without deleting this file.
 */
export default async function diu(
  _offerId: string
): Promise<Record<string, string>> {
  return {};
}
