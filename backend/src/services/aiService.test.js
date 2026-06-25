"use strict";

describe("aiService", () => {
  const job = { title: "Build", description: "Thing", skills: ["Rust", "Stellar"] };
  const apps = [{ id: "a1", freelancer_address: "GF", proposal: "I can", bid_amount: 10 }];

  afterEach(() => { jest.resetModules(); delete process.env.CLAUDE_API_KEY; delete global.fetch; });

  it("requires a Claude API key", async () => {
    const { scoreProposals } = require("./aiService");
    await expect(scoreProposals(job, apps)).rejects.toThrow("CLAUDE_API_KEY");
  });

  it("returns no scores when there are no applications", async () => {
    process.env.CLAUDE_API_KEY = "key";
    const { scoreProposals } = require("./aiService");
    await expect(scoreProposals(job, [])).resolves.toEqual([]);
  });

  it("parses JSON from Claude responses", async () => {
    process.env.CLAUDE_API_KEY = "key";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: 'Here: [{"id":"a1","score":9,"reasoning":"Strong"}]' }] }) });
    const { scoreProposals } = require("./aiService");
    await expect(scoreProposals(job, apps)).resolves.toEqual([{ id: "a1", score: 9, reasoning: "Strong" }]);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("anthropic"), expect.objectContaining({ method: "POST" }));
  });

  it("surfaces API and malformed JSON errors", async () => {
    process.env.CLAUDE_API_KEY = "key";
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" });
    const { scoreProposals } = require("./aiService");
    await expect(scoreProposals(job, apps)).rejects.toThrow("Claude API error: 500 boom");
  });
});
