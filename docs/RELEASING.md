# Releasing XOR

XOR ships as the public npm package `@quaannguyen/xor` and a matching GitHub Release.
The same npm package supports npm, pnpm, Yarn, and Bun.
OpenCode is the supported agent integration.

## Required checks

Run these commands from the release checkout:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run check:runtime-qualification
npm run test:package
npm pack --dry-run
```

The package check inspects the tarball contents and rejects missing files or bundled dependencies.
The runtime audit checks saved evidence against its recorded identities.
Passing that audit does not qualify a model whose saved results fail the replacement requirements.

The CI workflow checks Linux, macOS, and Windows with Node.js 22.12, 24, and 26.
Package Compatibility checks packed installation with npm, pnpm, Yarn, and Bun on all three platforms.
The E2E workflow checks the Electron companion on Ubuntu and the native companion on macOS.
Review each workflow's results before publishing.
A cancelled runner job is incomplete and must be retried.

Test the packed package in an isolated profile with the supported OpenCode version.
Verify automatic setup, repeated installation, saved owner settings, and `xor debug`.
Keep personal settings separate from release tests.
Use the [runtime guide](post-pr98-enhancements.md) for the recorded coverage and remaining host limits.

## Publish

1. Merge the verified release changes into the default branch.
2. Confirm that the package version has not already been published.
3. Confirm that the package version, version tag, and GitHub Release will match.
4. Tag the exact clean release commit with its version, such as `v0.1.5`.
5. Push the tag to start the Release workflow.
6. Wait for Verify Release and Publish npm Package to pass.
7. Create the matching GitHub Release with installation instructions and known limitations.
8. Install the exact published version in an isolated profile and run `xor debug`.

The Release workflow checks syntax, tests, saved runtime evidence, and package contents before publishing.
Its tag check rejects a version that differs from the package manifest.
The publish job uses the protected npm environment and npm trusted publishing with provenance.
Manual dispatch verifies the checkout without publishing.
Never move a published version tag or reuse a published package version.
Deprecate a broken package and publish a new version instead.

## Version 0.1.5

Version 0.1.5 adds owner Preference editing, automatic npm setup, optional companion controls, installed OpenCode diagnostics, final decoded-action checks, and local verdict receipts.
The desktop lockfile selects undici 7.30.1 to fix eight dependency advisories.

The owner authorized publication of the selected model despite its failed normal replacement requirements.
The [model report](model-0.1.5.md) records five new unsafe approvals, incomplete blind evaluation, and the difference between training fit and development results.
Keep these limits in the release notes.
Existing deterministic restrictions remain active.
Release authorization does not qualify the model, the scoped dataset export, or removal of runtime checks.
