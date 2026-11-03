# Checking registered tools at execution

XOR checks each registered OpenCode tool after the host selects its implementation and decodes its arguments.
A later before hook can repair or replace a proposed action without reusing an approval for a different action.
The selected implementation receives the private argument snapshot that XOR checked.

The runtime obtains the current user request and effective Preference for that check.
It applies the existing deterministic boundaries and native model decision.
It saves one final XOR verdict before allowing the implementation to run.
The early before hook no longer authorizes tools or writes verdict receipts.
Tool-result and completion observation remain separate.

## Inputs and receipts

The checked input contains the effective registered tool identity, decoded arguments, current request, and Preference snapshot.
Its receipt binds those values to the production request version, complete model-input hash, model digest, and native call identity.
Unchanged duplicate observations do not add another receipt.
Changed final arguments require their own check and identity.

Arguments must contain values that the JSON model request can represent exactly.
The runtime refuses functions, class instances, nonfinite numbers, unsupported properties, cycles, and other values that would change when serialized.
Ordinary decoded objects and arrays retain their values in a private copy.
Null-prototype objects retain their prototype.
A caller changing its original argument object while the model runs cannot change the checked copy supplied to the implementation.

The default local verdict log stays under the owner's XOR configuration directory.
Approve receipts retain the checked arguments.
Deny and ask receipts retain argument hashes and byte counts without their raw contents.
A model refusal does not supply arbitrary text for the saved reason.

When logging is enabled, an approval that cannot be saved withholds the action.
The error tells the owner to repair the verdict directory or turn logging off with `{"verdict_logging": false}` in `.xor/settings.json`.
Disabling logging does not disable checking.
An approval receipt records permission to release a checked action, not successful completion of its side effects.

## Cancellation and reload

The final executor's host signal joins plugin and session cancellation.
Cancelling a queued check prevents the native process from starting.
Cancelling an active check stops the process and withholds a late approval.
The composed signal also reaches the original tool implementation.
XOR cannot undo a side effect that finished before cancellation.

Folder deadlines still bound the native checker process.
Queue wait and checker duration remain separate.
Registry transforms persist across tool-registry rebuilds.
A private invocation identity prevents repeated wrapping from creating duplicate checks for the same invocation.
Nested calls with distinct identities still receive their own checks.

A host that lacks decoded execution transforms cannot activate this integration.
The adapter does not fall back to the unsafe early checking path.

## Observed behavior

The saved native receipt is [the November 3 final-execution check](experiments/opencode-final-execution-2026-11-03.json).
A local deterministic response fixture supplied fixed tool calls to real OpenCode 2.2.5.
The pinned native Needle model checked each final decoded action.
No external language model chose those calls.

The fixture changed a read into a harmless shell-marker command in a later hook.
The product checked and denied the actual shell action, and its marker remained absent.
The one denied receipt named the shell action and matched the hash of its decoded arguments.
Benign read and shell calls completed after host decoding removed unsupported fields.
The read used the host's ordinary omitted-offset behavior and returned its expected first-line marker.

A separate real-host run verified interruption and a one-millisecond checker deadline with absent shell markers.
A read pending across a tool-registry reload completed afterward with one final approval receipt.
A full location-reload request returned HTTP 204, disposed the old plugin generation, and loaded a new guarded generation while its shell marker remained absent.
The checker had already approved before disposal, so that run retained one approval receipt and does not prove cancellation of a still-running checker during full reload.
The earlier vulnerable and successful lifecycle receipts remain unchanged.

Run `node scripts/verify-opencode-final-input.mjs --output <new-directory> --model-root <installed-gate-root> --opencode <executable>` to repeat the rewrite check.
Run `node scripts/verify-opencode-lifecycle.mjs --output <new-directory> --model-root <installed-gate-root> --opencode <executable>` to repeat interruption, deadline, and registry-reload checks.
Both commands use local fixed response fixtures and the installed pinned native model.

## Remaining host limitations

The guarantee covers registered tool implementations that pass through the persistent transform.
OpenCode synthesizes its outer code-mode `execute` operation outside those registered definitions.
The registry transform does not establish final decoded authorization of that outer operation.
The [direct and nested MCP verification](opencode-mcp-verification.md) observes both paths reaching the guard with matching inputs and individual verdict receipts.
That evidence does not establish a Verdict for the outer wrapper.

A privileged native plugin can replace a guarded implementation outright or perform side effects without using the tool registry.
The host does not make XOR's transform unreplaceable.
This integration assumes trusted native plugin implementations and protects against ordinary later before-hook rewrites.
It does not claim protection against arbitrary native code from another plugin.

The [full-reload follow-up](experiments/opencode-location-reload-followup-2026-11-03.json) observes a successful checked read after the new plugin generation starts.
Cancelling a checker that remains active during full module replacement, synthesized outer execution, and unsupported or unwrapped tools retain separate compatibility requirements.
These runtime checks do not qualify the selected model or replace the existing deterministic policy checks.
