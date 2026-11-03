# PR 98 blast-radius review

The release changes the packaged model and adds global Preferences, owner editing, automatic setup, optional live pet controls, and installed diagnostics.
The review followed consumers outside the changed entry points, including settings migration, model caches, installed copies, native window sizing, and control discovery.

## Governing safety facts

Owner rules must remain authoritative independently of a model approval.
Permission errors must withhold actions rather than silently selecting the permissive built-in rules.
The original change failed these facts in two reproduced cases, and the fixes now pass executable tests through the shipped plugin hooks.
This is evidence level 4, running the real library and hooks, rather than a proof of every agent-generated action in the running application.

Model updates must preserve the previous pinned artifact cache.
A separate executable check used the shipped retrieval code to install two artifact identities, verified both remained ready, and reused the earlier cache after the update.
It did not execute synthetic model artifacts or claim model qualification.
The real installed native smoke checks remain distinct from those cache tests.

## Confirmed risks fixed before merge

| Finding | Trigger and likelihood | Cost | Owning code | Proof |
| --- | --- | --- | --- | --- |
| Global owner rules could be overwritten | The global settings file lies within the opened project, including an opened home folder or custom settings directory; conditional but realistic | High: an approved write could replace the owner's rules before the later quarantine | [Owner boundaries](../xor/lib/boundary.js) | The real before-action hook now rejects direct edits, removal, parent-directory moves, and shell writes before the approving model is called; aliases and shadowed global rules are covered |
| Unreadable global rules became permissive defaults | Directory permission failure or unavailable saved settings; conditional | High: the effective policy silently became permissive | [Preference reads](../xor/lib/preference.js) and [global settings reads](../xor/lib/config.js) | A real permission-denied directory makes the plugin withhold the next action without another model call; cross-platform error injection and dangling-symlink checks cover the read contract |
| Directory aliases destroyed live control discovery | Plugin and CLI address one settings directory through different filesystem aliases; uncommon | Medium: on/off and resize stop reaching the running plugin until restart | [Companion control discovery](../pet/control.js) | Three real controls through original, alias, and original paths now succeed and preserve the live registry entry, including creation of a new settings directory through an alias |

The protection fix covers the global owner file even when folder rules currently override it.
Ordinary neighboring project files and reads of the rules remain available to the model.
Only a genuinely missing file selects default settings.
The control endpoint uses the canonical existing directory identity.

## Checked and cleared

The retained host boundaries still reject outside paths, symlink escapes, protected local rules, and delegation even when the model always approves.
Failed staged plugin setup and missing hook registration preserve the previous installation.
Migration preserves effective global prose, completion checks, and existing sizes, and rejects conflicting completion identities before changing files.
Concurrent pet controllers remain independent, and optional pet failures do not disable action checking.
The model cache uses separate pinned identities for the earlier and selected weights.
The saved model report and replacement audit continue to report five new unsafe approvals and incomplete qualification.
No runtime policy check was removed and no qualification flag was promoted.
Runner pins and dependency versions remain unchanged by these fixes.

## Reproduce before merge

Run `node --test test/integration/global-preference-boundary.test.js test/integration/unreadable-settings.test.js test/integration/pet-control-alias.test.js`.
The tests invoke the shipped plugin and local socket implementation in isolated directories.
The permission test uses real filesystem denial where supported and a deterministic read-error check on every platform.
Run `npm test`, `npm run check`, `npm run check:runtime-qualification`, and `npm run test:package` for the wider consumers.
The full local suite passed 284 tests after the fixes.
The replacement audit still returns its expected incomplete-qualification status.

## Review synthesis

Two independent reviewers examined the complete base-to-head change and produced executable evidence.
The broader consumer census formed the base report, and the second review added the unreadable-settings reproduction.
The primary review independently reproduced the global owner-file overwrite.
All confirmed findings were retained and fixed; unsupported possibilities were not reported as defects.
The owner profile requires every agent to inherit the session model, so model diversity was reduced and no separate cross-family judge ran.

## Remaining merge requirements

Hosted checks must pass for the final commit, and the required human PR approval remains outstanding.
No review comments were present when this pass began.
The released model remains unqualified under normal replacement requirements, with the existing owner release exception recorded separately.
This review does not remove the dataset, blind-evaluation, or model-replacement requirements tracked outside this PR's completed product changes.
