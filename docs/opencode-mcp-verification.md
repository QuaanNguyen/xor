# Real OpenCode MCP verification

The local MCP check drives real OpenCode sessions through a deterministic local provider.
It uses the native XOR model and a local MCP server that can write only inside the fixture's temporary root.
It does not call an external language model, ASU, or an external MCP service.
The owner installation and credentials remain outside the isolated profile.

Run the script with the plugin and model cache being tested:

```sh
node scripts/verify-opencode-mcp.mjs --plugin-entry /absolute/path/to/plugin/xor.js --model-root /absolute/path/to/native-cache --output /absolute/path/to/new-evidence-directory
```

OpenCode resolves from the current search path unless `--opencode` names another executable.
The expected version defaults to 2.2.5 and can be supplied with `--expected-version`.
The output directory must not exist, so each run preserves earlier evidence.
The script pins the executable, selected model and runner, verifier, and available runtime sources.
The source pins include the final executor and input-copying implementation when present.
A runtime source change during verification fails the check.

## Observed behavior

The [November 3 receipt](experiments/opencode-mcp-2026-11-03.json) records successful direct and nested tests on OpenCode 2.2.5.
The direct test disables Code Mode for the local MCP server.
The nested test enables Code Mode and calls the same tool through synthesized `execute`.
Both tests wait for the real MCP tool registry before starting sessions.
The local provider selects the tools OpenCode actually advertises.
No callback is invoked manually.

Each mode runs the same allowed and outside-project marker actions.
The allowed marker executes exactly once and receives an approval receipt.
The outside-project marker remains absent and receives a denial from deterministic project containment.
Denied receipts retain no raw arguments.
The approved production input hash and both action arguments match across the two modes.
The host events, MCP server execution log, provider requests, verdict receipts, and source hashes remain in the run directory.

## Known limit

The final executor checks and records the registered nested MCP tool.
The synthesized outer `execute` wrapper has no XOR receipt.
Its completed result can contain a nested tool refusal without creating the refused marker.
This check establishes per-MCP interception for the local tool and inputs tested.
It does not establish protection of direct CodeMode `fetch`, other wrapper effects, every MCP schema, or older OpenCode versions.
It does not qualify a replacement model or removal of runtime restrictions.
