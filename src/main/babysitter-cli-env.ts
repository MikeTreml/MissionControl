import { promises as fs } from "node:fs";
import path from "node:path";

const SHIM_FILENAME = "babysitter-pi-agent-dir-shim.cjs";

const SHIM_SOURCE = String.raw`"use strict";

const fs = require("node:fs");
const os = require("node:os");
const Module = require("node:module");
const path = require("node:path");

const originalLoad = Module._load;

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Let the wrapped SDK surface the real runtime failure later.
  }
}

function defaultAgentDir(options) {
  const workspace = options && typeof options.workspace === "string"
    ? options.workspace
    : process.cwd();
  const userAgentDir = path.join(os.homedir(), ".pi", "agent");
  const fallbackAgentDir = path.join(workspace, ".a5c", "pi-agent");
  const agentDir = process.env.MC_PI_AGENT_DIR ||
    process.env.PI_CODING_AGENT_DIR ||
    (fs.existsSync(userAgentDir) ? userAgentDir : fallbackAgentDir);
  ensureDir(agentDir);
  return agentDir;
}

function resolvePiModel(model) {
  if (typeof model !== "string" || model.trim() === "") {
    return model;
  }
  try {
    const pi = require("@mariozechner/pi-coding-agent");
    if (!pi.AuthStorage || !pi.ModelRegistry) {
      return model;
    }
    const modelsPath = path.join(defaultAgentDir({}), "models.json");
    const registry = typeof pi.ModelRegistry.create === "function"
      ? pi.ModelRegistry.create(pi.AuthStorage.create(), modelsPath)
      : new pi.ModelRegistry(pi.AuthStorage.create(), modelsPath);
    const all = registry.getAll();
    const exact = all.find((entry) => entry.id === model);
    if (exact) {
      return exact;
    }
    const slash = model.indexOf("/");
    if (slash > 0) {
      const provider = model.slice(0, slash);
      const id = model.slice(slash + 1);
      const providerMatch = all.find((entry) => entry.provider === provider && entry.id === id);
      if (providerMatch) {
        return providerMatch;
      }
    }
  } catch {
    // If model resolution fails, leave the original string for the SDK.
  }
  return model;
}

function patchPiWrapper(mod) {
  if (!mod || mod.__mcAgentDirShimApplied || typeof mod.createPiSession !== "function") {
    return mod;
  }
  const ensureOptions = (options) => {
    const next = { ...(options || {}) };
    if (!next.agentDir) {
      next.agentDir = defaultAgentDir(next);
    }
    next.model = resolvePiModel(next.model);
    return next;
  };
  const originalCreatePiSession = mod.createPiSession;
  mod.createPiSession = function createPiSessionWithDefaultAgentDir(options) {
    return originalCreatePiSession.call(this, ensureOptions(options));
  };
  const proto = mod.PiSessionHandle && mod.PiSessionHandle.prototype;
  if (proto && typeof proto.doInitialize === "function") {
    const originalDoInitialize = proto.doInitialize;
    proto.doInitialize = async function patchedDoInitialize(...args) {
      this.options = ensureOptions(this.options);
      return originalDoInitialize.apply(this, args);
    };
  }
  Object.defineProperty(mod, "__mcAgentDirShimApplied", { value: true });
  return mod;
}

Module._load = function patchedModuleLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (/[\\/]@a5c-ai[\\/]babysitter-sdk[\\/]dist[\\/]harness[\\/]piWrapper\.js$/.test(resolved)) {
      return patchPiWrapper(loaded);
    }
  } catch {
    // Ignore resolution failures and leave unrelated modules untouched.
  }
  return loaded;
};
`;

export type BabysitterCliEnv = {
  env: NodeJS.ProcessEnv;
  shimPath: string;
  agentDir: string;
};

export async function buildBabysitterCliEnv(
  workspaceCwd: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): Promise<BabysitterCliEnv> {
  const runtimeDir = path.join(workspaceCwd, ".a5c", "mc-runtime");
  const shimPath = path.join(runtimeDir, SHIM_FILENAME);
  const userPiAgentDir = path.join(process.env.USERPROFILE ?? "", ".pi", "agent");
  const agentDir = baseEnv.MC_PI_AGENT_DIR
    ?? baseEnv.PI_CODING_AGENT_DIR
    ?? (process.env.USERPROFILE && await pathExists(userPiAgentDir)
      ? userPiAgentDir
      : path.join(workspaceCwd, ".a5c", "pi-agent"));
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(shimPath, SHIM_SOURCE, "utf8");

  const nodeOptionsShimPath = shimPath.replace(/\\/g, "/");
  const requireShim = `--require "${nodeOptionsShimPath}"`;
  const existingNodeOptions = baseEnv.NODE_OPTIONS?.trim();
  return {
    shimPath,
    agentDir,
    env: {
      ...baseEnv,
      MC_PI_AGENT_DIR: agentDir,
      NODE_OPTIONS: existingNodeOptions
        ? `${existingNodeOptions} ${requireShim}`
        : requireShim,
    },
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
