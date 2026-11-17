import { describe, expect, it } from "vitest";
import { shouldRefetch, STALE_AFTER_MS, statusFor } from "./live";

describe("connection state (TC-UI-01..03)", () => {
  const now = 1_000_000;

  it("is connecting until the first message arrives", () => {
    expect(statusFor(false, null, now)).toBe("connecting");
    expect(statusFor(true, null, now)).toBe("connecting");
  });

  it("is live with a recent heartbeat and stale after 5 s of silence", () => {
    expect(statusFor(true, now - 1_000, now)).toBe("live");
    expect(statusFor(true, now - STALE_AFTER_MS - 1, now)).toBe("stale");
  });

  it("is disconnected once the socket closes after having data", () => {
    expect(statusFor(false, now - 500, now)).toBe("disconnected");
  });
});

describe("store refetch routing (TC-UI-04..05)", () => {
  it("refetches everything live on '*' but never per-search or static queries", () => {
    expect(shouldRefetch("shelters", ["*"])).toBe(true);
    expect(shouldRefetch("plan", ["*"])).toBe(true);
    expect(shouldRefetch("public", ["*"])).toBe(false);
    expect(shouldRefetch("scenarios", ["*"])).toBe(false);
    expect(shouldRefetch(undefined, ["*"])).toBe(false);
  });

  it("refetches only the named topic otherwise", () => {
    expect(shouldRefetch("vehicles", ["vehicles"])).toBe(true);
    expect(shouldRefetch("shelters", ["vehicles"])).toBe(false);
  });
});
