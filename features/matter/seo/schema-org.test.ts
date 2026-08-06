import { describe, expect, it } from "vitest";
import { getMatterSchemaOrgGraph } from "./schema-org";

describe("Matter schema.org graph", () => {
  it("describes the publisher, canonical site, and web application", () => {
    const graph = getMatterSchemaOrgGraph("https://matter.example/matter");
    const serialized = JSON.stringify(graph);
    const nodes = graph["@graph"];

    expect(graph["@context"]).toBe("https://schema.org");
    expect(nodes.map((node) => node["@type"])).toEqual([
      "Organization",
      "WebSite",
      "WebApplication",
    ]);
    expect(nodes[1]?.url).toBe("https://matter.example/matter");
    expect(nodes[2]?.applicationCategory).toBe("DesignApplication");
    expect(serialized).toContain("brain-computer interface for thoughts shaping");
    expect(serialized).toContain("thinking with AI");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("provider");
  });
});
