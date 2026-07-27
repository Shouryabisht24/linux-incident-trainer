import path from "node:path";
import Docker from "dockerode";
import type { WebSocket } from "ws";
import { logger } from "../lib/logger.js";
import type { Challenge } from "./challenge.service.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const CHALLENGES_DIR = path.join(process.cwd(), "challenges");
const CHALLENGE_NETWORK = process.env.CHALLENGE_CONTAINER_NETWORK ?? "devops-trainer-challenges";
const APP_LABEL = "app=devops-trainer";

// ---------------------------------------------------------------------------
// Terminal exec-session registry — keyed by containerId (not by WS connection
// or sessionId). This is what makes a WebSocket reconnect resume the *same*
// bash process (same cwd/env/history) instead of spinning up a fresh
// `execShell()` every time. Every container-teardown path already funnels
// through `destroyContainer(containerId)` below, so hooking cleanup in there
// covers stopSession/reapIdleSessions/drainAllActiveSessions/reconcileOrphans
// for free — see decisions/0028.
// ---------------------------------------------------------------------------

export interface TerminalSession {
  stream: NodeJS.ReadWriteStream;
  resize: (opts: { h: number; w: number }) => Promise<void>;
  sockets: Set<WebSocket>;
  graceTimer: NodeJS.Timeout | null;
  paused: boolean;
  resumeCheckTimer: NodeJS.Timeout | null;
}

const RECONNECT_GRACE_MS = 120_000; // 2 minutes
const BACKPRESSURE_PAUSE_BYTES = 4 * 1024 * 1024; // 4 MiB
const BACKPRESSURE_RESUME_BYTES = 1 * 1024 * 1024; // 1 MiB
const BACKPRESSURE_CHECK_MS = 250;

const execRegistry = new Map<string, TerminalSession>(); // key: containerId

/**
 * Attach a WebSocket to the shell exec for `containerId`, creating one if it
 * doesn't exist yet. Reconnecting clients get `resumed: true` and the exact
 * same bash process — its data/end/error listeners are wired exactly once,
 * here, and fan out to whatever's currently in `session.sockets`.
 */
export async function attachOrCreateShell(
  containerId: string,
): Promise<{ session: TerminalSession; resumed: boolean }> {
  const existing = execRegistry.get(containerId);
  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer);
      existing.graceTimer = null;
    }
    return { session: existing, resumed: true };
  }

  const { stream, resize } = await execShell(containerId);
  const session: TerminalSession = {
    stream,
    resize,
    sockets: new Set(),
    graceTimer: null,
    paused: false,
    resumeCheckTimer: null,
  };

  stream.on("data", (chunk: Buffer) => {
    for (const ws of session.sockets) {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    }
    maybeApplyBackpressure(session);
  });

  stream.on("end", () => {
    for (const ws of session.sockets) ws.close(1000);
    execRegistry.delete(containerId);
  });

  stream.on("error", (err) => {
    logger.error("terminal exec stream error", { containerId, err });
    for (const ws of session.sockets) ws.close(1011);
    execRegistry.delete(containerId);
  });

  execRegistry.set(containerId, session);
  return { session, resumed: false };
}

function maybeApplyBackpressure(session: TerminalSession): void {
  if (session.paused) return;
  let overLimit = false;
  for (const ws of session.sockets) {
    if (ws.bufferedAmount > BACKPRESSURE_PAUSE_BYTES) {
      overLimit = true;
      break;
    }
  }
  if (!overLimit) return;

  session.paused = true;
  session.stream.pause();

  session.resumeCheckTimer = setInterval(() => {
    let allDrained = true;
    for (const ws of session.sockets) {
      if (ws.bufferedAmount >= BACKPRESSURE_RESUME_BYTES) {
        allDrained = false;
        break;
      }
    }
    if (allDrained) {
      session.stream.resume();
      session.paused = false;
      if (session.resumeCheckTimer) {
        clearInterval(session.resumeCheckTimer);
        session.resumeCheckTimer = null;
      }
    }
  }, BACKPRESSURE_CHECK_MS);
}

/** Detach one socket from a shell session; starts the reconnect-grace teardown timer once no sockets remain attached. */
export function releaseSocket(containerId: string, ws: WebSocket): void {
  const session = execRegistry.get(containerId);
  if (!session) return;

  session.sockets.delete(ws);
  if (session.sockets.size > 0 || session.graceTimer) return;

  session.graceTimer = setTimeout(() => {
    const current = execRegistry.get(containerId);
    if (!current || current.sockets.size > 0) return;
    if (current.resumeCheckTimer) {
      clearInterval(current.resumeCheckTimer);
      current.resumeCheckTimer = null;
    }
    current.stream.end();
    execRegistry.delete(containerId);
  }, RECONNECT_GRACE_MS);
}

/** Immediately tears down the shell exec session for a container, e.g. as part of destroying the container itself. */
export function endShellSession(containerId: string): void {
  const session = execRegistry.get(containerId);
  if (!session) return;

  if (session.graceTimer) clearTimeout(session.graceTimer);
  if (session.resumeCheckTimer) clearInterval(session.resumeCheckTimer);
  for (const ws of session.sockets) ws.close(4000, "session ended");
  session.stream.end();
  execRegistry.delete(containerId);
}

function imageTag(challenge: Challenge): string {
  return `devops-trainer/${challenge.slug}:${challenge.content_version}`;
}

export async function ensureChallengeNetwork(): Promise<void> {
  const networks = await docker.listNetworks({ filters: { name: [CHALLENGE_NETWORK] } });
  if (networks.some((n) => n.Name === CHALLENGE_NETWORK)) return;

  await docker.createNetwork({
    Name: CHALLENGE_NETWORK,
    Driver: "bridge",
    Internal: true,
    Labels: { app: "devops-trainer" },
  });
  logger.info("created challenge network", { network: CHALLENGE_NETWORK });
}

export async function buildImageIfMissing(challenge: Challenge): Promise<string> {
  const tag = imageTag(challenge);
  const existing = await docker.listImages({ filters: { reference: [tag] } });
  if (existing.length > 0) return tag;

  const challengeDir = path.join(CHALLENGES_DIR, challenge.slug);
  logger.info("building challenge image", { tag });

  const stream = await docker.buildImage(
    { context: challengeDir, src: ["Dockerfile", "seed.sh", "check.sh"] },
    { t: tag },
  );

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, output) => {
        if (err) return reject(err);
        const errorEvent = output.find((event) => "error" in event);
        if (errorEvent) return reject(new Error(String(errorEvent.error)));
        resolve();
      },
      () => {},
    );
  });

  logger.info("built challenge image", { tag });
  return tag;
}

export interface CreatedContainer {
  id: string;
  name: string;
}

export async function createSessionContainer(
  sessionId: string,
  challenge: Challenge,
  imageTagName: string,
): Promise<CreatedContainer> {
  const name = `devops-trainer-session-${sessionId}`;
  const limits = challenge.resource_limits ?? {};
  const memoryMb = limits.memoryMb ?? 256;
  const cpus = limits.cpus ?? 0.5;
  const pidsLimit = limits.pidsLimit ?? 100;

  // Fixed hostname + matching /etc/hosts entry so tools like `sudo` can resolve
  // the container's own hostname even under NetworkMode "none" (otherwise sudo
  // prints a "unable to resolve host" warning on every invocation).
  const hostname = "trainer";

  // Per-challenge size-bounded tmpfs mounts (e.g. disk-full scenarios) — we
  // never bind-mount host paths (decisions/0002), so a size-limited tmpfs is how
  // a challenge gets a real, fillable filesystem. Shape: { "/path": "size=16m" }.
  const tmpfs: Record<string, string> = { ...(challenge.tmpfs ?? {}) };

  const hostConfig: Docker.ContainerCreateOptions["HostConfig"] = {
    Memory: memoryMb * 1024 * 1024,
    NanoCpus: Math.round(cpus * 1e9),
    PidsLimit: pidsLimit,
    NetworkMode: challenge.requires_network ? CHALLENGE_NETWORK : "none",
    ExtraHosts: [`${hostname}:127.0.0.1`],
    AutoRemove: false,
  };

  // systemd-in-Docker (decisions/0005): PID 1 is /sbin/init (set in the
  // challenge's Dockerfile CMD), which needs SYS_ADMIN, a writable cgroup fs,
  // and tmpfs-backed /run + /run/lock. The cgroup mount is the one sanctioned
  // exception to "no bind mounts" (it's the cgroup pseudo-fs, not host data).
  if (challenge.requires_systemd) {
    hostConfig.CapAdd = ["SYS_ADMIN"];
    hostConfig.Binds = ["/sys/fs/cgroup:/sys/fs/cgroup:rw"];
    tmpfs["/run"] = "";
    tmpfs["/run/lock"] = "";
  }

  if (Object.keys(tmpfs).length > 0) hostConfig.Tmpfs = tmpfs;

  const container = await docker.createContainer({
    name,
    Image: imageTagName,
    Hostname: hostname,
    Labels: { app: "devops-trainer", sessionId, challengeSlug: challenge.slug },
    HostConfig: hostConfig,
  });

  await container.start();
  return { id: container.id, name };
}

export async function destroyContainer(containerId: string): Promise<void> {
  endShellSession(containerId);
  const container = docker.getContainer(containerId);
  // No graceful container.stop() here on purpose (see decisions/0015): these are
  // disposable, single-use training containers with nothing worth flushing at
  // teardown, and most challenge PID 1s (`sleep infinity`, or `/sbin/init` for
  // systemd challenges) ignore SIGTERM outright, so stop({t:5}) reliably burned
  // the whole 5s timeout before force-killing anyway. remove({ force: true })
  // alone already SIGKILLs a still-running container as part of removal, so it
  // gets us the same end state near-instantly.
  try {
    await container.remove({ force: true });
  } catch (err) {
    if (!isNotModifiedOrMissing(err)) throw err;
  }
}

function isNotModifiedOrMissing(err: unknown): boolean {
  const statusCode = (err as { statusCode?: number }).statusCode;
  return statusCode === 304 || statusCode === 404;
}

/** Interactive shell exec, used by the WebSocket terminal bridge. Runs as the unprivileged "trainee" user. */
export async function execShell(containerId: string): Promise<{
  stream: NodeJS.ReadWriteStream;
  resize: (opts: { h: number; w: number }) => Promise<void>;
}> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ["/bin/bash", "-l"],
    User: "trainee",
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ["TERM=xterm-256color"],
  });

  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  return {
    stream: stream as unknown as NodeJS.ReadWriteStream,
    resize: (opts) => exec.resize(opts),
  };
}

/** Runs check.sh as root inside the container and returns whether the challenge is solved. */
export async function runCheck(containerId: string): Promise<{ passed: boolean; output: string }> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ["/usr/local/bin/check.sh"],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, Tty: false });
  const chunks: Buffer[] = [];
  const stdout = { write: (chunk: Buffer) => chunks.push(chunk) };
  const stderr = { write: (chunk: Buffer) => chunks.push(chunk) };

  await new Promise<void>((resolve, reject) => {
    docker.modem.demuxStream(stream, stdout as unknown as NodeJS.WritableStream, stderr as unknown as NodeJS.WritableStream);
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const inspection = await exec.inspect();
  return { passed: inspection.ExitCode === 0, output: Buffer.concat(chunks).toString("utf8") };
}

/** All container IDs Docker currently reports for our label, regardless of what the DB thinks. */
export async function listLabeledContainerIds(): Promise<Set<string>> {
  const containers = await docker.listContainers({ all: true, filters: { label: [APP_LABEL] } });
  return new Set(containers.map((c) => c.Id));
}

/** Force-removes any devops-trainer-labeled container not in the given set of still-valid (DB-known) container IDs. */
export async function reconcileOrphans(dbKnownContainerIds: Set<string>): Promise<void> {
  const containers = await docker.listContainers({ all: true, filters: { label: [APP_LABEL] } });
  for (const info of containers) {
    if (dbKnownContainerIds.has(info.Id)) continue;
    logger.warn("removing orphaned challenge container", { names: info.Names.join(", ") });
    try {
      await destroyContainer(info.Id);
    } catch (err) {
      logger.warn("failed to remove orphan container", { id: info.Id, err });
    }
  }
}

export async function isContainerAlive(containerId: string): Promise<boolean> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}
