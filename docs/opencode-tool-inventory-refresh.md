# OpenCode image and schedule tool contracts

The November 3 refresh adds six contracts from pinned OpenCode 2.2.5 source to the existing [tool inventory](checker-tool-inventory.json).
Other inventory entries retain their original release and inspection dates.
The refresh does not establish reviewed training coverage or real tool interception.

The current image tool is `experimental_image_generate`.
OpenCode 2.2.1 called it `image_generate`.
The pinned image implementation is identical in 2.2.2 and 2.2.5.
The tool is registered only when an image model is available and the configuration does not disable it.
Its source keeps it outside Code Mode.
No image was generated during this refresh.

The five schedule tools are `opencode_schedule_create`, `opencode_schedule_list`, `opencode_schedule_pause`, `opencode_schedule_resume`, and `opencode_schedule_delete`.
These are the actual native execution identities.
Their Code Mode discovery names use the `opencode` namespace and a dot, such as `opencode.schedule_create`.
The inventory keeps that discovery name separately in `codeModeName`.
Both forms come from the pinned upstream naming functions.
The tools require the experimental schedules setting.
The creation contract includes both shell and Code Mode conditions.
Those conditions can run unattended, so a reviewed outer creation call does not prove that each later condition or nested action passes through XOR.
No schedule was created or fired during this refresh.

## Reproduce the extraction

Run `scripts/refresh-opencode-inventory.js` with the captured source directory, an isolated dependency directory, the existing inventory, and the output inventory path.
The script verifies every captured source hash before evaluating schema declarations.
It extracts the actual upstream schema expressions and converts them with the pinned schema library.
It does not execute a tool, condition, command, schedule, image request, or generated scenario.
It replaces only the six refreshed identities and records their source dependencies.
Repeated extraction produces the same inventory bytes.

Save the primary sources below with the listed local filenames.
All versions are 2.2.5 except the two explicitly versioned image files.
The inventory's refresh receipt records the exact SHA-256 values and source URLs.

| Local filename | Primary source |
| --- | --- |
| `schema.ts` | [Shared schema helpers](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/schema/src/schema.ts) |
| `tool-runtime.ts` | [Native name normalization](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/tool/runtime.ts) |
| `codemode-tool.ts` | [Code Mode qualified names](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/codemode/tool.ts) |
| `tool.ts` | [Generic tool execution hooks](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/tool.ts) |
| `schedule.ts` | [Schedule tool registration](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/tool/plugin/schedule.ts) |
| `schedule-schema.ts` | [Schedule request schema](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/schema/src/schedule.ts) |
| `image-generate.ts` | [Current image input and registration](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/tool/plugin/image-generate.ts) |
| `image-generate-2.2.1.ts` | [Earlier image tool name](https://github.com/anomalyco/opencode/blob/v2.2.1/packages/core/src/tool/plugin/image-generate.ts) |
| `image-generate-2.2.2.ts` | [Renamed image tool](https://github.com/anomalyco/opencode/blob/v2.2.2/packages/core/src/tool/plugin/image-generate.ts) |

Install the schema tools in the isolated dependency directory.
The versions match the upstream [2.2.5 dependency catalog](https://github.com/anomalyco/opencode/blob/v2.2.5/package.json).

```sh
npm install --prefix /tmp/xor-schema-tools --ignore-scripts --no-audit --no-fund effect@4.0.6 typescript@npm:@typescript/typescript6@6.0.2
node scripts/refresh-opencode-inventory.js /path/to/captured-sources /tmp/xor-schema-tools docs/checker-tool-inventory.json /tmp/refreshed-inventory.json
node --test test/unit/opencode-tool-inventory.test.js test/unit/checker-data.test.js
```

## What still needs evidence

The pinned generic tool executor invokes the before-execution hook with the tool's input.
That source establishes that these are hookable tool registrations.
It does not establish observed direct or nested calls, native approve/deny/ask results, or every feature-gated route.
The inventory therefore keeps integration verification false for all six entries.
The OpenCode compatibility ticket still requires its version-specific runtime checks.

The existing coverage checker requires reviewed decision examples for these contracts in every applicable split.
An empty reviewed set reports these tools as missing coverage.
The ordinary draft generator can consume their extracted schemas, but those drafts remain unreviewed.
Human verification, held-out results, and model qualification remain separate requirements.
Dynamic MCP catalogs and other uncaptured tools retain their existing explicit gaps.
The historical browser, session, and worktree entries keep their earlier source names and remain unverified for native integration.
This refresh does not silently remap those entries or establish that their names match current final-execution receipts.

Frozen studies must continue using their own copied inventory and hashes.
Do not point an old snapshot at this refreshed inventory and reinterpret the resulting hash mismatch as damaged historical evidence.
Prepare a separate successor study when using these new contracts.
