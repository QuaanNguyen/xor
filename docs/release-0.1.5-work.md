# XOR 0.1.5 implementation and qualification

The owner requested expanding the release pull request to cover the Preference, model-policy, installation, pet, and diagnostic tickets on November 3, 2026.

## Work plan

1. Ground the current CLI, plugin, settings, installation, and model evidence.
2. Compare designs and choose interfaces for settings and controls.
3. Implement the agreed design without a separate approval checkpoint.
4. Verify each feature through its real user entry point and the packed installation.
5. Revisit the design if implementation reveals conflicting ownership.

## Design

The CLI remains the entry point for owner edits, controls, and diagnosis.
Preference resolution and live reload remain in the existing Preference module.
The exact current folder overrides the global Preference, which overrides the built-in Preference.
Parent folder Preferences do not apply implicitly.
The editor works on temporary prose and preserves completion criteria on save.
Cancellation leaves saved settings unchanged.

Pet controls use global settings and apply to active plugin sessions.
The pet defaults to off, including installations with an existing size and no saved enablement.
Existing sizes survive migration.
The model continues checking every action when no pet runs.
The npm lifecycle calls the existing installer, with the explicit install command retained for repair.
Diagnostics use the installed plugin and native model in an isolated temporary project.

The alternative design concentrated Preferences, pet settings, migration, and installation in a new settings service.
The selected design extends existing modules because they already own these concerns.
The alternate design's useful contribution is one shared validation rule for positive finite pet sizes and explicit effective Preference metadata.
Both architecture candidates used the current session model, as required by the owner profile.
The architecture cross-judge was omitted because that profile requires the same model for every role.

## Ticket requirements

| Work | Ticket | Completion evidence |
| --- | --- | --- |
| Preference policy training | #89 | Production inputs, matched approve/deny/ask examples, permissive cases, and coverage gaps |
| Qualified dataset | #90 | Frozen inputs, independent reviews, missing settings contrast, qualified export, and remaining human requirements |
| Native model comparison | #91 | Dataset/model/runner/platform identities, repeated decisions, separate failure categories, and timing limitations |
| Replace runtime checks | #92 | Each check mapped to trusted input facts and independent model-only evaluation before removal |
| Preference editing | #93 | Editor save/cancel/removal, scope fallback, live reload, and migration preservation |
| Permissive installation | #94 | Permissive default remains model checked and observed behavior is tested |
| npm setup | #95 | Packed local/global installation and repeat installation preserve settings |
| Optional pet controls | #96 | Off by default, on/off, positive finite decimal sizes, immediate controls, and migration |
| Installation diagnostics | #97 | Actual OpenCode loading, native model, isolated actions, Preference source, and optional pet checks |

## Model qualification boundary

The saved release report records five new unsafe approvals, an unscored frozen test split, and incomplete replacement qualification.
Packaging and CLI tests do not change those results.
Existing checks cannot be called replaced or their tickets closed until their required evaluation evidence exists.
Missing model artifacts, invalid verdicts, timeouts, and malformed settings remain runtime errors regardless of policy ownership.
