import { describe, expect, it } from "vitest";
import { imageTag, isNotModifiedOrMissing } from "../../src/services/docker.service.js";
import type { Challenge } from "../../src/services/challenge.service.js";

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: "id-1",
    slug: "disk-full-var-log",
    title: "Disk Full",
    category_slug: "storage",
    category_name: "Storage",
    difficulty: "beginner",
    description_md: "",
    requires_network: false,
    requires_systemd: false,
    resource_limits: null,
    time_limit_minutes: null,
    content_version: 1,
    solution_md: "",
    is_active: true,
    tmpfs: null,
    ...overrides,
  } as Challenge;
}

describe("imageTag", () => {
  it("builds the devops-trainer/<slug>:<content_version> tag", () => {
    expect(imageTag(makeChallenge({ slug: "disk-full-var-log", content_version: 1 }))).toBe(
      "devops-trainer/disk-full-var-log:1",
    );
  });

  it("reflects a bumped content_version in the tag (cache-busting on content change)", () => {
    expect(imageTag(makeChallenge({ slug: "perm-config-blocks-service", content_version: 3 }))).toBe(
      "devops-trainer/perm-config-blocks-service:3",
    );
  });
});

describe("isNotModifiedOrMissing", () => {
  it("is true for a dockerode error with statusCode 304 (not modified)", () => {
    expect(isNotModifiedOrMissing({ statusCode: 304 })).toBe(true);
  });

  it("is true for a dockerode error with statusCode 404 (already gone)", () => {
    expect(isNotModifiedOrMissing({ statusCode: 404 })).toBe(true);
  });

  it("is false for any other statusCode", () => {
    expect(isNotModifiedOrMissing({ statusCode: 500 })).toBe(false);
    expect(isNotModifiedOrMissing({ statusCode: 409 })).toBe(false);
  });

  it("is false when there is no statusCode at all", () => {
    expect(isNotModifiedOrMissing(new Error("boom"))).toBe(false);
    expect(isNotModifiedOrMissing({})).toBe(false);
    expect(isNotModifiedOrMissing(null)).toBe(false);
  });
});
