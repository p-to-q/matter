import { describe, expect, it } from "vitest";
import { GET as getFullLlms } from "@/app/llms-full.txt/route";
import { GET as getLlms } from "@/app/llms.txt/route";

describe("public model-interaction copy", () => {
  it("keeps the short LLM map aligned with the fixed Elastic direction", async () => {
    const body = await (await getLlms()).text();

    expect(body).toContain("Voice admits human material.");
    expect(body).toContain("`expand-in-place` tool policy");
    expect(body).not.toContain("speak a direction");
    expect(body).not.toContain("Voice carries intent");
    expect(body).toMatch(/Elastic and\s+Text Swap remain unavailable/);
    expect(body).not.toContain("fixture-gated generative transform turn");
  });

  it("describes Ask Matter as a transient multi-question inquiry, not a chat context", async () => {
    const body = await (await getFullLlms()).text();

    expect(body).toContain("sole secondary AI entrance");
    expect(body).toContain("consecutive short");
    expect(body).toMatch(/earlier\s+questions and answers never become model context/);
    expect(body).toContain("no generative-voice direction path");
    expect(body).toContain("Thought labels, transcript repair, and Ask");
    expect(body).toContain("Elastic and Text\nSwap remain unavailable");
    expect(body).not.toContain("speaks\nthe direction");
    expect(body).not.toContain("fixture-gated\nturn path");
  });
});
