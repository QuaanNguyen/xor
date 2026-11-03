# Check the final action before execution

A real OpenCode 2.2.5 test reproduced a later-hook rewrite after XOR approved a read.
OpenCode executed the replacement shell call and created a fixed harmless marker.
The before hook is too early to establish that the checked action is the action that runs.

## Existing flow

The OpenCode adapter collects the proposed arguments, current user request, and Preference.
The session applies deterministic boundaries and asks the native gate for a decision.
The gate owns the process queue, deadlines, cancellation, and complete production-request identity.
The adapter currently saves its decision before OpenCode finishes the remaining before hooks and decodes the selected tool's arguments.
A later before hook can therefore change the operation after approval.
The repository context describes the before hook as the interception point, but it does not establish that this hook sees the final action.
The real reproduction overrides that assumption.

## Chosen ownership

Registered tools receive one authorization inside their final decoded execution function.
One runtime operation owns the private argument snapshot, request and Preference snapshots, cancellation, decision, receipt, and invocation of the original executor.
The host adapter only installs and disposes a persistent registry transform and converts native execution context into that operation.
The native gate keeps its process and timing responsibilities.
The receipt writer keeps atomic persistence and duplicate suppression.
The after hook continues to observe results and settings changes.

The runtime passes the private checked snapshot to the original executor.
It must not check a copy and later execute a mutable caller-owned object.
It must not introduce another asynchronous pause between final admission and invocation.
The executor keeps the host cancellation context.
The gate and plugin lifetimes can also cancel pending checks.

When logging is enabled, an approval that cannot be saved must not release an unrecorded action.
The owner receives a storage error and can repair storage or explicitly turn logging off.
A missing record must never be reported as a successful write.

## Alternatives and synthesis

Two independent same-model designs considered early freezing, approval caching, duplicate checking, a final executor guard, and an upstream final-execution hook.
Both selected one check at the decoded executor for registered tools.
The selected design gives the runtime ownership of both the check and the invocation, avoiding an asynchronous handoff after a final approval.
The smaller adapter from the other design keeps registry iteration and host details outside policy ownership.

Early freezing does not establish decoded action identity and can break legitimate hooks.
Approval caching requires invalidation and schema canonicalization across two stages.
Checking twice adds two decisions and leaves receipt ownership unclear.
An upstream final-execution hook would cover more host paths but is not an available local plugin change.
Permission hooks alone do not establish complete arguments for every tool.

The comparison used final-action enforcement, one final receipt, cancellation behavior, reload behavior, and interface simplicity.
Both designs pass those criteria for registered tools when the real tests pass.
Neither establishes universal coverage of synthesized tools.
The user profile requires all roles to inherit the session model, so this comparison did not use a different model family.

## Compatibility limits

OpenCode's synthesized outer `execute` action is not an ordinary registered tool definition.
A registry transform alone cannot establish that this outer invocation receives a final model decision.
Nested registered actions can be checked at their own executor, but that requires observed direct and nested MCP tests.
A before-hook deny for `execute` does not repair the gap if another hook can rewrite a different tool into it.
Keep this limitation explicit until an enforceable host boundary is verified.

A privileged plugin can replace a registered implementation or perform native side effects without calling tools.
XOR cannot make untrusted native plugin code safe through a replaceable plugin wrapper.
The supported guarantee assumes trusted plugin implementations and addresses ordinary argument-rewriting hooks.

The host decodes arguments before final execution.
Raw before-hook JSON equality is therefore invalid because decoding can drop unsupported fields or add defaults.
Check the final supported representation directly.
If a decoded value cannot be represented faithfully in the production model request, withhold it and report the unsupported contract.

## Verification contract

The actual product must deny the reproduced replacement shell call and leave its marker absent.
An unchanged permitted read and a permitted decoded/defaulted call must still execute once.
Every observed registered execution must have one final decision matching its effective tool and executed argument snapshot.
Cancellation, timeout, invalid answers, unavailable checker artifacts, and failed required receipt storage must leave the marker absent.
Registry reload must preserve the guard without stacking duplicate checks.
Real direct and nested MCP calls, full plugin-module reload, and synthesized outer execution retain separate observed requirements.
Existing historical receipts remain unchanged.
New verification receipts identify the exact source used by the repaired implementation.
