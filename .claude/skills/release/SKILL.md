---
name: release
description: Release the Rallybeam extension to the VS Code Marketplace and Open VSX, as a stable release or a pre-release. Use when the owner asks to release, publish or ship a new version.
---

# Release the extension

The **Release** workflow (`.github/workflows/release.yml`) builds one `.vsix` from `main` and publishes it to the
GitHub release, the VS Code Marketplace and Open VSX through trusted publishing. It publishes the `version` in
`package.json` on `main`, so a release is: a version bump merged into `main`, then one run of the workflow.

## 1. Choose the version

- Ask the owner: **stable** or **pre-release**, unless they said.
- A version is published only once, and a pre-release and a stable release never share one. The Marketplace
  convention: an **even minor** for stable (`0.2.0`, `0.4.0`), an **odd minor** for pre-releases (`0.3.0`, `0.5.0`).
  A fix to a published stable version raises the patch (`0.2.1`).
- Check what is already out: `gh release list --limit 5`. Never reuse a tag that exists.

## 2. The release pull request

1. Branch from the latest `origin/main`.
2. Set the version in `package.json` and in the two root entries of `package-lock.json` (`"version"` at the top and
   under `packages[""]`). Do not change any dependency's version.
3. Add a `## <version>` section at the top of `CHANGELOG.md`: what changed since the last release, in the reader's
   words, from `git log v<last version>..origin/main`. Say plainly when the code is unchanged.
4. Run `npm run check`.
5. Push, and open the pull request into `main`.

Merge it only when the owner says so, once CI is green.

## 3. Publish

Only on the owner's go-ahead, since publishing is public and cannot be undone:

- Stable: `npm run release` (the same as `gh workflow run release.yml --ref main -f pre-release=false`).
- Pre-release: `npm run release:pre`.
- Without the GitHub CLI, the GitHub MCP tool `actions_run_trigger` runs `release.yml` on `main` with the input
  `pre-release` set to `false` or `true`.

## 4. Check the result

- All four jobs (`build`, `github-release`, `marketplace`, `open-vsx`) must succeed.
- Read the `marketplace` and `open-vsx` logs: `--skip-duplicate` makes a skipped version look like success. Expect
  `Published vivani.rallybeam v<version>` from the Marketplace and a published (not "already published") line from
  Open VSX.
- A store that failed: fix the cause, then run Release again for the same commit. The GitHub release is kept and the
  store that already has the version is skipped.
- Tell the owner the listing may take a few minutes:
  `https://marketplace.visualstudio.com/items?itemName=vivani.rallybeam` and
  `https://open-vsx.org/extension/vivani/rallybeam`.
