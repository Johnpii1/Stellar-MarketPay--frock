"use strict";

jest.mock("../db/pool", () => ({ query: jest.fn() }));
const pool = require("../db/pool");
const svc = require("./developerService");

describe("developerService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates hashed API keys with normalized labels", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: "k1", owner_public_key: "GOWNER", label: "Developer key", key_prefix: "sk_live_abc", created_at: "now" }] });
    const result = await svc.createApiKey({ ownerPublicKey: "GOWNER", label: "   " });
    expect(result.apiKey).toMatch(/^sk_live_/);
    expect(pool.query.mock.calls[0][1][1]).toBe("Developer key");
    expect(pool.query.mock.calls[0][1][3]).toBe(svc.hashApiKey(result.apiKey));
    expect(result.key.id).toBe("k1");
  });

  it("lists, revokes, finds and records API keys", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "k1", requests_today: "2" }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "k1" }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    await expect(svc.listApiKeys("GOWNER")).resolves.toHaveLength(1);
    await expect(svc.revokeApiKey("GOWNER", "k1")).resolves.toBe(true);
    await expect(svc.findApiKeyByRawValue("secret")).resolves.toEqual({ id: "k1" });
    await svc.recordApiKeyUsage("k1");
    expect(pool.query).toHaveBeenCalledTimes(5);
  });

  it("returns public resources and clamps job limit", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "j1" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ public_key: "GPROFILE" }] });
    await expect(svc.listPublicJobs(999)).resolves.toEqual([{ id: "j1" }]);
    expect(pool.query.mock.calls[0][1][0]).toBe(50);
    await expect(svc.getPublicJob("missing")).resolves.toBeNull();
    await expect(svc.getPublicFreelancerProfile("GPROFILE")).resolves.toEqual({ public_key: "GPROFILE" });
  });


  it("covers default branches for labels, limits, and null rows", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: "k2", label: "Developer key" }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await svc.createApiKey({ ownerPublicKey: "GOWNER", label: null });
    expect(pool.query.mock.calls[0][1][1]).toBe("Developer key");
    await expect(svc.revokeApiKey("GOWNER", "missing")).resolves.toBe(false);
    await expect(svc.findApiKeyByRawValue("missing")).resolves.toBeNull();
    await expect(svc.listPublicJobs(-10)).resolves.toEqual([]);
    expect(pool.query.mock.calls[3][1][0]).toBe(1);
    await expect(svc.getPublicFreelancerProfile("missing")).resolves.toBeNull();
  });
});
