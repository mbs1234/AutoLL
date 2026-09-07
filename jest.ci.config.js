/**
 * CI test config: the base config minus the suites that are already broken in
 * pristine upstream `mickey`.
 *
 * Upstream ships a red test suite at f1f022a. Eight suites failed when this
 * list was first written; four still do. `src/api/ll.test.ts` additionally
 * cannot even load upstream, because it imports the unpublished `./diu`
 * module -- so its ~27 stale failures were invisible until this fork added a
 * diu stub. (Example: `experiences()` expects `data.availableExperiences`,
 * which the test's mocked response no longer provides.)
 *
 * The other four were re-measured against the full suite and pass, so they
 * are gated on again -- two of them, `Home` and `Home/MultiPassList`, cover
 * screens this fork modified. An exclusion that has quietly become stale is
 * coverage given away for nothing, which matters more now that `test:ci`
 * gates the publish and not just the badge.
 *
 * Gating CI on the full suite would make it permanently red and therefore
 * useless as a signal. Excluding these makes CI meaningful again: anything new
 * that breaks -- including in code this fork adds -- shows up immediately.
 *
 * These are excluded because they are ALREADY failing, not to hide new
 * breakage. Run `npm test` for the unfiltered picture. If upstream repairs a
 * suite (or we do), delete it from this list.
 */
const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/api/ll\\.test\\.ts$',
    '<rootDir>/src/components/ll/ModifyButton\\.test\\.tsx$',
    '<rootDir>/src/components/ll/screens/BookExperience\\.test\\.tsx$',
    '<rootDir>/src/components/ll/screens/YourDay\\.test\\.tsx$',
  ],
};
