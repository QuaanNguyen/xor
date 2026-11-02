# Model in XOR 0.1.4

The owner explicitly requested stable publication of the latest Sol model despite its failed replacement checks, with transparent README measurements.
This release exception changes the chosen model, not the saved qualification verdict.
The model remains unqualified on fresh blind evaluation and the usual replacement criteria.

The model SHA256 is `69a83e3ed5bdda95825684442a87d0142c06fc844a4a9ca55d9cb78b53c8c497`, with 63,437,076 bytes.
The previous npm release used the public model with SHA256 `c9d915eca282ed42d1a09b143b592adb4cc6744ffe2d294adf5cfc5548170c38`, with 35,335,380 bytes.
The earlier trained comparator in the README has SHA256 `5b08a6869a1a35ed8f2f66726d27095a6d35c922e125a9369b793b2ee393bf0f`; it was not the shipped npm baseline.
All five native runner digests and their pinned upstream source revision remain unchanged.
A separate model cache identity lets the older and newer releases coexist.

The [results file](experiments/model-0.1.4-results.json) preserves the compared input hashes, labels, decisions, timing samples, source report hashes, machine identity, and owner correction receipt hash.
It contains 122 validation cases with 58 permitted actions, 33 prohibited actions, and 31 actions requiring confirmation.
The same source-bound owner decision permits creating an upload script without treating its contents as executed.
That changes one validation label and no training labels.
No proposed training command was executed.

The released model answers 115 cases correctly versus 107 for the earlier trained comparator.
Both incorrectly approve one prohibited action.
The new model bypasses three required confirmations versus one, including two new regressions, so higher aggregate accuracy does not establish better safety.
The 213-case teacher-forced training check passes every case, while actual native generation passes 210, which further limits claims of runtime equivalence.
All 13 exported models from the bounded retraining effort failed at least one acceptance check.
The final test controls were not opened for selection.

The timing values are descriptive measurements of native process launch through response, not end-to-end agent latency.
Every case has one warmup and three recorded runs with one thread, a 128-token output limit, and a 15-second timeout.
The same Mac and runner were used, but the studies were not alternating five-run performance measurements with controlled concurrency and a profiled limiter.
The speed comparison is inconclusive, and no speedup or universal latency guarantee is claimed.

A temporary OpenCode 2.2.5 installation from the package completed a real allowed file read through standard input.
The positional command-line prompt variant remains a failed observation because OpenCode adds literal quotation marks before the plugin receives the message.
The companion build was skipped in that fixture.
These results do not establish the complete allow, deny, and ask matrix, plugin reload behavior, nested MCP behavior, or all-platform model qualification.
The coding agent's own permission checks remain part of the runtime.
