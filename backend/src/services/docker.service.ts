import path from "node:path";
import Docker from "dockerode";
import { logger } from "../lib/logger.js";
import type { Challenge } from "./challenge.service.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const CHALLENGES_DIR = path.join(process.cwd(), "challenges");
const CHALLENGE_NETWORK = process.env.CHALLENGE_CONTAINER_NETWORK ?? "devops-trainer-challenges";
const APP_LABEL = "app=devops-trainer";

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
  const container = docker.getContainer(containerId);
  try {
    await container.stop({ t: 5 });
  } catch (err) {
    if (!isNotModifiedOrMissing(err)) throw err;
  }
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
