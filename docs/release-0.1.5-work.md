# XOR 0.1.5 implementation and qualification

The owner requested expanding the release pull request to cover the Preference, model-policy, installation, pet, and diagnostic tickets on November 3, 2026.

## Settings and installation

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

## Issue requirements

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

## Implementation results

Folder/global editing, override removal, cancellation, live reload, and migration preservation are implemented.
The built-in Preference uses the exact previously reviewed wording: "Act like a normal harness. Follow the user's request without adding restrictions."
The model still checks actions with that Preference.
The remaining trusted runtime restrictions mean the broader fresh-installation behavior still depends on the replacement work.

Packed npm local and global installations now run setup and preserve saved owner settings during repeated installation.
Installation verifies the staged plugin's actual startup and action-hook registration before replacing a working installation.
An OpenCode configuration listing alone does not establish plugin startup.
The explicit install command remains available for repair and for package managers that block lifecycle scripts.
Npm 12 requires its package-specific script permission.
Development and release verification install dependencies without running product setup.

The pet defaults off and supports global on/off, arbitrary positive finite decimal percentages, and reset.
Controls reach concurrent plugin sessions and do not stop action checking.
Unrepresentable window dimensions are constrained to the physical display while the requested percentage remains saved.
Native macOS compilation and live on/off/87.5-percent controls passed in an isolated installed preview.
The desktop automation surface could not expose the unbundled native companion for visual inspection.

Diagnostics check OpenCode compatibility, effective Preference source, installed plugin files, pinned artifacts, native approve/deny/ask decisions, installed action hooks, and enabled pet readiness.
The integration probe uses a private OpenCode server and a real session without starting an external language model.
It invokes the installed registered action hooks, reads a harmless fixture under the built-in Preference, and observes the result hook.
It does not claim to test agent-generated tool selection.
The probe canonicalizes temporary paths to account for macOS aliases.

## Dataset progress and remaining qualification

The [successor receipt](experiments/model-policy-successor-2026-11-03.json) records six independently agreed examples and repairs the missing owner-settings shell contrast.
It preserves the previous selected cases and source-bound exclusions.
A prior ambiguous attempt remains quarantined.
The full evidence is retained locally under `.audit/policy-successor-2026-11-03` in the source checkout.
Raw scenario datasets are not added to source control.
No generated command was executed, and no new model was trained.
The packaged 0.1.5 weights remain unchanged.

The [replacement audit](model-policy-replacement.md) records the existing native comparison, new dataset coverage, missing trusted facts, and unresolved qualification.
Human verification and a qualified export remain required for the dataset ticket.
The comparison ticket retains its qualified-export prerequisite.
Independent model-only replacement evaluation, fresh blind evidence, and resolution of the five newly unsafe approvals remain required before removing runtime checks.
The broader permissive fresh-installation ticket remains linked to that replacement work.

## Verification

The full repository suite passed 286 tests.
Syntax, package contents, and the generated runtime-evidence audit passed.
The policy-replacement audit returned its expected incomplete-qualification status after verifying the repaired contrast and saved native counterexamples.
Its regression tests reject mismatched review inputs and unsupported qualification claims.
The exact packed package installed locally and globally in an isolated profile with OpenCode 2.2.5 and the pinned public model and runner.
The installed diagnostic returned PASS for required checks and SKIP for the disabled pet.
Those checks preceded the merge of PR 98.
PR 99 subsequently passed 340 repository tests and added the final-action guard, local verdict receipts, and the patched desktop dependency.
See [the runtime guide](post-pr98-enhancements.md) for the current implementation and remaining requirements.

The hosted Windows failures exposed a named-pipe half-close assumption, platform-specific path assertions, and executable test fixtures.
Pet controls now use bounded newline frames and acknowledgements without relying on client EOF.
The fake benchmark uses a pinned executable and pinned test script with no shell, and production comparisons continue to require the native executable.
Yarn package-layout checks skip lifecycle setup consistently with the other layout checks.
Separate packed npm installation tests continue to exercise automatic setup.

The [blast-radius review](pr98-blast-radius.md) records three reproduced regressions and their executable fixes.
Global owner files are protected even inside the project, unreadable saved rules withhold actions, and control discovery survives filesystem aliases.

The saved-settings reader also distinguishes genuinely missing directories from disconnected directory aliases, with shared handling for global rules and pet settings.
