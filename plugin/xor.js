import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

function findRepo(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, "xor/lib/session.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveRoot(start) {
  if (process.env.XOR_ROOT) return process.env.XOR_ROOT;
  const bundledXor = path.join(start, "xor");
  if (fs.existsSync(path.join(bundledXor, "xor/lib/session.js"))) return bundledXor;
  return findRepo(start);
}

const repoRoot = resolveRoot(here);
if (!repoRoot) {
  throw new Error(
    "xor cannot find xor/lib/session.js. Run scripts/install-plugin (copies xor + pet next to the plugin), or set XOR_ROOT.",
  );
}

const xorLibDir = path.join(repoRoot, "xor/lib");

const { createXorAdapter } = require(path.join(xorLibDir, "adapter.js"));
const { EventBus } = require(path.join(repoRoot, "events/index.js"));
const { createPetController } = require(path.join(repoRoot, "pet/controller.js"));
const { createLivePreference } = require(path.join(xorLibDir, "preference.js"));
const { createNeedleGate } = require(path.join(xorLibDir, "gate.js"));

const { readGateSettings } = require(path.join(xorLibDir, 'gate-settings.js'));
const { recordVerdict } = require(path.join(xorLibDir, 'verdict-log.js'));

const { assertOpenCodeVersion } = require(path.join(xorLibDir, "opencode-version.js"));

function targetOf(tool, args) {
  const a = args || {};
  return a.command || a.cmd || a.url || a.query || a.filePath || a.path || a.pattern || tool;
}

function sessionBlockedMessage(tool, args, reason) {
  return [
    'xor refused this action.',
    'Requested action: ' + tool,
    'Target: ' + targetOf(tool, args),
    'Governing rule: preference_validity',
    'Decided by: folder Preference',
    'Reason: ' + reason,
    'Permitted alternative: Ask the owner to correct the folder Preference.',
    'Retry: owner action is required; do not retry until the Preference is fixed.',
  ].join('\n');
}

function userText(parts) {
  return (parts || [])
    .filter((part) => part && (part.type === undefined || part.type === 'text') && !part.synthetic && !part.ignored)
    .map((part) => part.text || part.content || '')
    .join('\n')
    .trim();
}

function resultText(output) {
  if (!output) return "";
  if (typeof output.output === "string") return output.output;
  if (typeof output.content === "string") return output.content;
  if (output.error) return String(output.error.message || output.error);
  return typeof output === "string" ? output : JSON.stringify(output);
}

function lastAssistantCompletion(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.data || payload?.messages || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    const info = item.info || item;
    const role = info.role;
    if (role !== "assistant") continue;
    const parts = item.parts || info.parts || [];
    const text = parts.map((p) => p.text || p.content || "").join("");
    const content = text.trim() ? text : typeof item.content === "string" ? item.content : "";
    return {
      id: info.id || item.id || null,
      text: content,
      completed: info.time?.completed != null && !info.error && info.finish === "stop",
      error: info.error || null,
      finish: info.finish || null,
      claims: item.claims || info.claims || [],
    };
  }
  return null;
}

function sessionIDOf(event) {
  const props = event.properties || event.data || event;
  return props.sessionID || props.session?.id || event.sessionID;
}

function isBusy(event) {
  const props = event.properties || event.data || event;
  const status = props.status;
  return status === "busy" || status?.type === "busy";
}

function isIdle(event) {
  if (event.type === "session.idle") return true;
  if (event.type === "session.error") return true;
  const props = event.properties || event.data || event;
  const status = props.status;
  const type = typeof status === "string" ? status : status?.type;
  return ["idle", "stopped", "stop", "cancelled", "canceled", "error"].includes(type);
}

const DIST_CANDIDATES = [
  "node_modules/electron/dist/electron.exe",
  "node_modules/electron/dist/electron",
  "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
];

function electronBinary(petDir) {
  for (const rel of DIST_CANDIDATES) {
    const candidate = path.join(petDir, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  const pkg = path.join(petDir, "node_modules/electron");
  if (!fs.existsSync(pkg)) return null;
  try {
    const bin = require(pkg);
    if (typeof bin === "string" && fs.existsSync(bin)) return bin;
  } catch {
    return null;
  }
  return null;
}

function launchPet() {
  if (process.env.XOR_NO_PET === "1") return;
  const petDir = path.join(repoRoot, "pet");
  const native = path.join(petDir, "native", "pet-host");
  const bin = process.platform === "darwin" ? native : electronBinary(petDir);
  if (!bin) {
    console.error(
      "[xor] Pet xor not launched: Electron binary missing under " + petDir +
      ". Re-run: bash scripts/install-plugin.sh",
    );
    return;
  }
  if (!fs.existsSync(bin)) {
    console.error(
      "[xor] Pet xor not launched: native macOS host missing under " + petDir +
      ". Re-run: bash scripts/install-plugin.sh",
    );
    return;
  }
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  const args = process.platform === "darwin"
    ? [`--pet-dir=${petDir}`]
    : ["."];
  const child = spawn(bin, args, {
    cwd: petDir,
    detached: false,
    stdio: ["pipe", "ignore", "ignore"],
    env,
  });
  child.on("error", (err) => {
    console.error("[xor] failed to launch Pet xor:", err.message);
  });
  child.stdin.on("error", () => {});
  child.unref();
  child.stdin.unref?.();
  return child;
}

export const xor = async ({ client, directory, version }, options = {}) => {
  const workdir = directory || process.cwd();
  const livePreference = createLivePreference({ workdir });
  const gate = typeof options?.gate === "function" ? options.gate : (typeof options?.verifier === "function" ? options.verifier : createNeedleGate({ workdir }));
  let preferenceState = livePreference.refresh();
  const bus = new EventBus();
  const petController = createPetController({
    bus,
    launch: options.launchPet || launchPet,
    onError: (error) => console.error('[xor] Pet settings could not be applied:', error.message),
  });
  const sessions = new Map();
  const userMessages = new Map();
  const xorFeedback = new Set();
  let ended = false;
  let lastActiveSessionID = null;
  let quarantinedPreferenceFingerprint = null;

  function blockedReason(state) {
    return "xor blocked this session because " + state.reason + ". Fix the Preference at " + state.file + ".";
  }

  function refreshPreference() {
    const next = livePreference.refresh();
    if (quarantinedPreferenceFingerprint === next.fingerprint) {
      preferenceState = {
        ...next,
        valid: false,
        reason: 'the Preference changed during an agent tool execution. A human must save a corrected Preference before work can continue',
      };
      return preferenceState;
    }
    quarantinedPreferenceFingerprint = null;
    preferenceState = next;
    return preferenceState;
  }

  function publish(out) {
    if (!out || !out.events) return;
    for (const e of out.events) bus.emit(e);
  }

  function syncPreference(state, next) {
    if (!next.valid || state.preferenceRevision === next.revision) return;
    state.xor.replacePreference(next.preference);
    state.preferenceRevision = next.revision;
    state.preferenceFingerprint = next.fingerprint;
    publish({
      events: [{
        type: "protocol",
        status: "ok",
        petState: "calm",
        summary: "Preference reloaded",
        detail: { text: next.preference.text, source: next.source },
      }],
    });
  }

  function stateFor(sessionID, next = refreshPreference()) {
    const key = sessionID || "plugin";
    let state = sessions.get(key);
    if (state) {
      syncPreference(state, next);
      return state;
    }
    const adapter = createXorAdapter({ preference: next.valid ? next.preference : null, workdir, gate });
    state = {
      xor: adapter,
      reviewed: new Set(),
      activeChecks: new Set(),
      completionPending: true,
      review: null,
      preferenceRevision: next.valid ? next.revision : null,
      preferenceFingerprint: next.valid ? next.fingerprint : null,
    };
    sessions.set(key, state);
    publish(state.xor.start());
    return state;
  }

  function releaseSession(sessionID) {
    if (!sessionID) return;
    userMessages.delete(sessionID);
    const state = sessions.get(sessionID);
    if (!state) return;
    for (const controller of state.activeChecks) controller.abort();
    try {
      publish(state.xor.end());
    } catch {
    }
    sessions.delete(sessionID);
    if (lastActiveSessionID === sessionID) lastActiveSessionID = null;
  }

  function endSession() {
    if (ended) return;
    ended = true;
    process.removeListener("beforeExit", endSession);
    process.removeListener("exit", endSession);
    for (const state of sessions.values()) {
      for (const controller of state.activeChecks) controller.abort();
      try {
        publish(state.xor.end());
      } catch {
      }
    }
    bus.close();
    petController.close();
    gate.dispose?.();
  }

  process.on("beforeExit", endSession);
  process.on("exit", endSession);

  if (!preferenceState.valid) {
    bus.emit({
      type: "notification",
      status: "error",
      petState: "denied",
      summary: "Folder Preference cannot be applied",
      reason: preferenceState.reason,
      detail: {
        priority: "high",
        preferencePath: preferenceState.file,
        remediation: blockedReason(preferenceState),
      },
    });
  }

  function rememberUserMessage(sessionID, text) {
    if (!sessionID || !text || xorFeedback.has(text)) return;
    userMessages.set(sessionID, text);
  }

  async function latestUserMessage(sessionID) {
    if (!sessionID) return '';
    if (userMessages.has(sessionID)) return userMessages.get(sessionID);
    if (!client?.session?.messages) return '';
    let payload;
    try {
      payload = await client.session.messages({ path: { id: sessionID } });
    } catch {
      return '';
    }
    const list = Array.isArray(payload) ? payload : payload?.data || payload?.messages || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const info = list[i].info || list[i];
      if (info.role !== "user") continue;
      const text = userText(list[i].parts || info.parts);
      if (text && !xorFeedback.has(text)) return text;
    }
    return '';
  }

  async function reviewCompletion(sessionID) {
    if (!sessionID) return;
    const next = refreshPreference();
    const state = stateFor(sessionID, next);
    if (!next.valid) {
      bus.emit({
        type: "notification",
        status: "error",
        petState: "denied",
        summary: "Folder Preference cannot be applied",
        reason: next.reason,
      });
      return;
    }
    const doneCriteria = state.xor.preference.done_criteria;
    if (!client?.session?.messages) {
      if (doneCriteria.length) {
        bus.emit({
          type: "notification",
          status: "error",
          petState: "error",
          summary: "Completion observation is unavailable",
          reason: "The OpenCode client does not provide session messages.",
        });
      }
      return;
    }
    let payload;
    try {
      payload = await client.session.messages({ path: { id: sessionID } });
    } catch (error) {
      bus.emit({
        type: "notification",
        status: "error",
        petState: "error",
        summary: "Completion observation failed",
        reason: String(error?.message || error),
      });
      return;
    }
    const completion = lastAssistantCompletion(payload);
    if (!completion) {
      if (doneCriteria.length) {
        bus.emit({
          type: "notification",
          status: "error",
          petState: "error",
          summary: "Completion observation found no assistant response",
        });
      }
      return;
    }
    const reviewKey = completion.id || `${completion.finish || ""}:${completion.text}`;
    if (state.reviewed.has(reviewKey)) return;
    state.reviewed.add(reviewKey);
    const out = state.xor.assistantCompletion(completion);
    publish(out);
    const sendFeedback = client?.session?.promptAsync || client?.session?.prompt;
    if (out.inject && sendFeedback) {
      xorFeedback.add(out.inject.trim());
      Promise.resolve().then(() => sendFeedback.call(client.session, {
        path: { id: sessionID },
        body: { noReply: true, parts: [{ type: "text", text: out.inject }] },
      })).catch((error) => {
        bus.emit({
          type: "notification",
          status: "error",
          petState: "error",
          summary: "Completion feedback could not be recorded",
          reason: String(error?.message || error),
        });
      });
    }
  }

  function scheduleCompletionReview(sessionID) {
    if (!sessionID) return;
    const state = stateFor(sessionID);
    if (state.review) return state.review;
    if (!state.completionPending) return Promise.resolve();
    state.completionPending = false;
    const review = Promise.resolve()
      .then(() => reviewCompletion(sessionID))
      .catch(() => {})
      .finally(() => {
        if (state.review === review) state.review = null;
      });
    state.review = review;
    return review;
  }

  return {
    dispose: endSession,
    "chat.message": async (input, output) => {
      rememberUserMessage(input?.sessionID, userText(output?.parts));
    },

    "tool.execute.before": async (input, output) => {
      if (ended) throw new Error('xor is stopped. Reload the plugin before running tools.');
      const tool = input.tool || "";
      const args = structuredClone(output?.args || input.args || {});
      const next = refreshPreference();
      if (!next.valid) throw new Error(sessionBlockedMessage(tool, args, blockedReason(next)));
      const state = stateFor(input.sessionID, next);
      const controller = new AbortController();
      const signal = input.signal ? AbortSignal.any([controller.signal, input.signal]) : controller.signal;
      state.activeChecks.add(controller);
      try {
        const userMessage = await latestUserMessage(input.sessionID);
        const checkedPreference = structuredClone(state.xor.preference);
        const out = await state.xor.proposedAction({
          tool,
          args,
          signal,
          userMessage,
        });
        publish(out);
        if (input.callID && readGateSettings(workdir).verdictLogging) {
          const detail = out.events.at(-1)?.detail || {};
          const verdict = { allow: 'approve', disallow: 'deny', ask: 'ask' }[out.decision];
          const rule = out.events.at(-1)?.rule || 'gate';
          try {
            recordVerdict({
              sessionID: input.sessionID,
              callID: input.callID,
              agentVersion: version,
              tool,
              args,
              userMessage,
              preference: checkedPreference,
              verdict,
              reason: verdict === 'approve' ? 'The checker approved the action' : `The action was withheld by ${rule}`,
              modelSha256: gate.modelSha256,
              inputHash: detail.inputHash,
              requestVersion: detail.requestVersion,
              timing: { timeoutMs: detail.timeoutMs ?? null, queueMs: detail.queueMs ?? null, checkerMs: detail.checkerMs ?? null },
            });
          } catch (error) {
            console.error('[xor] Verdict could not be saved:', error.message);
          }
        }
        if (out.decision !== "allow") throw new Error(out.message);
      } finally {
        state.activeChecks.delete(controller);
      }
    },

    "tool.execute.after": async (input, output) => {
      const existing = sessions.get(input.sessionID || "plugin");
      const observed = livePreference.refresh();
      if (existing && existing.preferenceFingerprint && existing.preferenceFingerprint !== observed.fingerprint) {
        quarantinedPreferenceFingerprint = observed.fingerprint;
        const quarantined = refreshPreference();
        bus.emit({
          type: "notification",
          status: "error",
          petState: "denied",
          summary: "Folder Preference needs human correction",
          reason: quarantined.reason,
        });
        return;
      }
      const next = refreshPreference();
      if (!next.valid) return;
      const state = stateFor(input.sessionID, next);
      publish(state.xor.toolResult({
        tool: input.tool,
        status: output?.error ? "error" : "completed",
        result: resultText(output),
        error: output?.error,
      }));
    },

    event: async ({ event }) => {
      if (!event) return;
      let sessionID = sessionIDOf(event);
      if (sessionID) lastActiveSessionID = sessionID;
      else if (event.type === "session.idle" || isIdle(event)) sessionID = lastActiveSessionID;
      if (event.type === "session.deleted") {
        releaseSession(sessionID);
        return;
      }
      const status = (event.properties || event.data || event).status;
      const statusType = typeof status === "string" ? status : status?.type;
      if (["session.error", "session.execution.interrupted", "session.execution.failed"].includes(event.type) || ["stopped", "stop", "cancelled", "canceled", "error"].includes(statusType)) {
        const existing = sessions.get(sessionID || "plugin");
        for (const controller of existing?.activeChecks || []) controller.abort();
      }
      const next = refreshPreference();
      if (!next.valid) return;
      const state = stateFor(sessionID, next);
      if (event.type === "session.status" && isBusy(event)) {
        state.completionPending = true;
        publish(state.xor.lifecycle("busy"));
      }
      if (event.type === "session.idle" || isIdle(event)) {
        publish(state.xor.lifecycle("idle"));
        await scheduleCompletionReview(sessionID);
        return;
      }
    },
  };
};

function messageText(parts) {
  return (parts || []).map((part) => part?.text || part?.content || "").join("");
}

function v2Messages(messages) {
  return (messages || []).map((message) => {
    if (message?.info || message?.parts) return message;
    const parts = Array.isArray(message.content)
      ? message.content.filter((part) => part.type === "text")
      : message.text ? [{ type: "text", text: message.text }] : [];
    return {
      info: {
        id: message.id,
        role: message.role || message.type,
        finish: message.finish,
        time: message.time,
        error: message.error,
      },
      parts,
      content: typeof message.content === "string" ? message.content : messageText(parts),
    };
  });
}

function v2Client(ctx) {
  return {
    session: {
      async messages({ path }) {
        const sessionID = path?.id;
        if (typeof ctx.session?.context === "function") return v2Messages(await ctx.session.context({ sessionID }));
        if (typeof ctx.session?.messages === "function") return ctx.session.messages({ path });
        return [];
      },
      prompt({ path, body }) {
        const sessionID = path?.id;
        const text = messageText(body?.parts);
        if (typeof ctx.session?.synthetic === "function") return ctx.session.synthetic({ sessionID, text });
        if (typeof ctx.session?.prompt === "function") return ctx.session.prompt({ sessionID, text });
        return Promise.resolve();
      },
      promptAsync(input) {
        return this.prompt(input);
      },
    },
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toolInput(event) {
  if (isRecord(event?.input)) return event.input;
  if (isRecord(event?.args)) return event.args;
  return {};
}

export default {
  id: "xor",
  async setup(ctx, options = {}) {
    assertOpenCodeVersion(ctx.app?.version);
    const directory = ctx.location?.directory || ctx.location?.project?.directory || process.cwd();
    const hooks = await xor({ client: v2Client(ctx), directory, version: ctx.app?.version }, options);
    await ctx.tool.hook("execute.before", async (event) => {
      await hooks["tool.execute.before"](
        { tool: event.tool, sessionID: event.sessionID, callID: event.callID || event.id, signal: event.signal },
        { args: toolInput(event) },
      );
    });
    await ctx.tool.hook("execute.after", async (event) => {
      const failed = event.status === "error" || event.error;
      await hooks["tool.execute.after"](
        { tool: event.tool, sessionID: event.sessionID, callID: event.callID || event.id, args: toolInput(event) },
        failed
          ? { error: event.error }
          : { output: typeof event.result === "string" ? event.result : event.result?.output || event.output || "" },
      );
    });
    const controller = new AbortController();
    if (typeof ctx.event?.subscribe === "function") {
      void (async () => {
        try {
          for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
            await hooks.event({ event });
          }
        } catch (error) {
          if (error?.name !== "AbortError") throw error;
        }
      })();
    }
    return () => {
      controller.abort();
      hooks.dispose();
    };
  },
};
