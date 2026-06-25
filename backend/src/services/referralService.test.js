"use strict";

jest.mock("../db/pool", () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require("../db/pool");
const svc = require("./referralService");
const pk = (c) => `G${c.repeat(55)}`;

describe("referralService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("validates public keys and prevents self-referrals", async () => {
    await expect(svc.registerReferral("bad", pk("A"))).rejects.toThrow("Invalid Stellar public key");
    await expect(svc.registerReferral(pk("A"), pk("A"))).rejects.toThrow("cannot be the same");
  });

  it("registers referrals and ignores duplicates/FK misses", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [] });
    await expect(svc.registerReferral(pk("A"), pk("B"))).resolves.toEqual({ id: 1 });
    await expect(svc.registerReferral(pk("A"), pk("C"))).resolves.toBeNull();
    pool.query.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }));
    await expect(svc.registerReferral(pk("A"), pk("D"))).resolves.toBeNull();
  });

  it("gets referrer and returns null when none", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ referrer_address: pk("A") }] }).mockResolvedValueOnce({ rows: [] });
    await expect(svc.getReferrerForReferee(pk("B"))).resolves.toBe(pk("A"));
    await expect(svc.getReferrerForReferee(pk("C"))).resolves.toBeNull();
  });

  it("processes first-job payout transaction", async () => {
    const client = { query: jest.fn().mockResolvedValue({}), release: jest.fn() };
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: "0" }] }).mockResolvedValueOnce({ rows: [{ id: 7, referrer_address: pk("A") }] });
    await expect(svc.processReferralPayout("job1", pk("B"), "100", "tx")).resolves.toEqual({ referrer: pk("A"), bonusXlm: "2.0000000" });
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("skips payout for prior jobs, missing referrals, or invalid amounts", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: "1" }] });
    await expect(svc.processReferralPayout("job1", pk("B"), "100")).resolves.toBeNull();
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: "0" }] }).mockResolvedValueOnce({ rows: [] });
    await expect(svc.processReferralPayout("job1", pk("B"), "100")).resolves.toBeNull();
    pool.query.mockResolvedValueOnce({ rows: [{ cnt: "0" }] }).mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await expect(svc.processReferralPayout("job1", pk("B"), "nope")).resolves.toBeNull();
  });

  it("formats referral stats", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total_referrals: "2", paid_referrals: "1", pending_referrals: "1", total_earned_xlm: "3" }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, referee_address: pk("B"), status: "paid", payout_amount: "2", created_at: "d" }] })
      .mockResolvedValueOnce({ rows: [{ id: 9, referee_address: pk("B"), job_id: "j", job_title: "Job", amount_xlm: "2", created_at: "d" }] });
    const stats = await svc.getReferralStats(pk("A"));
    expect(stats.totalEarnedXlm).toBe("3.0000000");
    expect(stats.referees[0].payoutAmount).toBe("2.0000000");
  });
});
