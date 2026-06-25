"use strict";

jest.mock("../db/pool", () => ({ query: jest.fn() }));
const pool = require("../db/pool");
const svc = require("./daoService");
const pk = (c) => `G${c.repeat(55)}`;
const row = { id: "p1", title: "T", description: "D", type: "treasury", proposer: pk("A"), status: "active", votes_for: "2", votes_against: "1", voting_ends_at: new Date(Date.now()+100000).toISOString(), quorum_reached: false };

describe("daoService", () => {
  beforeEach(() => jest.clearAllMocks());
  it("lists and gets proposals", async () => {
    pool.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    expect(await svc.listProposals({ status: "active" })).toEqual([expect.objectContaining({ id: "p1", votesFor: 2 })]);
    await expect(svc.getProposal("p1")).resolves.toEqual(expect.objectContaining({ quorumPercent: 10 }));
    await expect(svc.getProposal("missing")).rejects.toThrow("Proposal not found");
  });
  it("validates and creates proposals", async () => {
    await expect(svc.createProposal({ proposer: "bad", title: "T", description: "D", type: "treasury" })).rejects.toThrow("Invalid");
    await expect(svc.createProposal({ proposer: pk("A"), title: " ", description: "D", type: "treasury" })).rejects.toThrow("required");
    await expect(svc.createProposal({ proposer: pk("A"), title: "T", description: "D", type: "bad" })).rejects.toThrow("Type must");
    pool.query.mockResolvedValueOnce({ rows: [{ id: "p1" }] }).mockResolvedValueOnce({ rows: [row] });
    await expect(svc.createProposal({ proposer: pk("A"), title: " T ", description: " D ", type: "treasury", votingDays: 99 })).resolves.toEqual(expect.objectContaining({ id: "p1" }));
  });
  it("casts votes and rejects closed/expired proposals", async () => {
    pool.query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ ...row, votes_for: "5" }] });
    await expect(svc.castVote({ proposalId: "p1", voter: pk("B"), support: true, weight: "5", txHash: "tx" })).resolves.toEqual(expect.objectContaining({ votesFor: 5 }));
    pool.query.mockResolvedValueOnce({ rows: [{ ...row, status: "passed" }] });
    await expect(svc.castVote({ proposalId: "p1", voter: pk("B") })).rejects.toThrow("closed");
    pool.query.mockResolvedValueOnce({ rows: [{ ...row, voting_ends_at: new Date(Date.now()-1000).toISOString() }] });
    await expect(svc.castVote({ proposalId: "p1", voter: pk("B") })).rejects.toThrow("ended");
  });
  it("handles arbitrators and treasury", async () => {
    const arb = { public_key: pk("C"), display_name: "Ada", bio: "Bio", votes_received: 3, disputes_resolved: 1, elected_at: "now" };
    pool.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [arb] }).mockResolvedValueOnce({ rows: [arb] }).mockResolvedValueOnce({ rows: [arb] }).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [arb] }).mockResolvedValueOnce({ rows: [{ allocated: "10", active_proposals: 2 }] });
    await svc.finalizeExpiredProposals();
    await expect(svc.listArbitrators()).resolves.toHaveLength(1);
    await expect(svc.upsertArbitrator({ publicKey: pk("C"), displayName: "Ada" })).resolves.toEqual(expect.objectContaining({ publicKey: pk("C") }));
    await expect(svc.voteForArbitrator({ voter: pk("A"), arbitratorKey: pk("C"), weight: 2 })).resolves.toHaveLength(1);
    await expect(svc.getTreasurySummary()).resolves.toEqual({ allocatedXlm: "10", activeProposals: 2, quorumPercent: 10 });
  });
});
