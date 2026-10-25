import { describe, expect, it } from "vitest";
import { imageChatTransport, imageGenerationsTransport } from "./image-transport";
import type { ScenarioCall } from "./harness";

const PAYLOAD = Buffer.from("not really pixels, but a valid base64 body").toString("base64");
const JPEG_URL = `data:image/jpeg;base64,${PAYLOAD}`;
const PNG_URL = `data:image/png;base64,${PAYLOAD}`;

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_MAGIC = [0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

function body(magic: readonly number[], length = 64): string {
  return Buffer.from([...magic, ...new Array<number>(Math.max(0, length - magic.length)).fill(7)])
    .toString("base64");
}

const SNIFFED_PNG = body(PNG_MAGIC);

function chat(content: unknown, extra: Record<string, unknown> = {}): unknown {
  return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop", ...extra }] };
}

function call(prompt: string): ScenarioCall {
  return Object.freeze({
    scenario: "matter-thought-label",
    prompt,
    locale: "en",
    input: null,
    deadlineMs: 30_000,
    maxOutputTokens: 1_200,
  });
}

function refused(transport: typeof imageChatTransport, payload: unknown) {
  const parsed = transport.parseCompletion(payload);
  expect(parsed.unusable).toBeDefined();
  expect(parsed.content).toBeUndefined();
  return parsed;
}

describe("image transports", () => {
  it("gives each shape a stable id and its own operation path", () => {
    expect(imageChatTransport.id).toBe("image-chat-completions");
    expect(imageGenerationsTransport.id).toBe("image-generations");
    expect(imageChatTransport.completionUrl("https://relay.example/v1")).toBe(
      "https://relay.example/v1/chat/completions",
    );
    expect(imageGenerationsTransport.completionUrl("https://relay.example/v1")).toBe(
      "https://relay.example/v1/images/generations",
    );
    expect(imageChatTransport.authHeaders("k")).toEqual({ authorization: "Bearer k" });
    expect(imageGenerationsTransport.authHeaders("k")).toEqual({ authorization: "Bearer k" });
  });

  describe("parsing", () => {
    it("reads the chat-shaped markdown image as a data URL", () => {
      const parsed = imageChatTransport.parseCompletion(chat(`![image](${JPEG_URL})`));
      expect(parsed).toEqual({ content: JPEG_URL, disposition: "complete" });
    });

    it("reads the images-shaped b64_json as the same kind of string", () => {
      const parsed = imageGenerationsTransport.parseCompletion({ data: [{ b64_json: SNIFFED_PNG }] });
      expect(parsed).toEqual({
        content: `data:image/png;base64,${SNIFFED_PNG}`,
        disposition: "complete",
      });
    });

    it("names a hintless payload by its first bytes instead of assuming PNG", () => {
      for (const [magic, mediaType] of [
        [JPEG_MAGIC, "jpeg"], [PNG_MAGIC, "png"], [WEBP_MAGIC, "webp"],
      ] as const) {
        const encoded = body(magic);
        expect(imageGenerationsTransport.parseCompletion({ data: [{ b64_json: encoded }] }))
          .toEqual({ content: `data:image/${mediaType};base64,${encoded}`, disposition: "complete" });
        expect(imageGenerationsTransport.parseCompletion({ data: [{ b64_json: encoded }], output_format: null }).content)
          .toBe(`data:image/${mediaType};base64,${encoded}`);
      }
    });

    it("sniffs a payload that is exactly as long as its signature, padding included", () => {
      const webp = Buffer.from(WEBP_MAGIC).toString("base64");
      expect(imageGenerationsTransport.parseCompletion({ data: [{ b64_json: webp }] }).content)
        .toBe(`data:image/webp;base64,${webp}`);
      const jpeg = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
      expect(jpeg.endsWith("=") || jpeg.length === 4).toBe(true);
      expect(imageGenerationsTransport.parseCompletion({ data: [{ b64_json: jpeg }] }).content)
        .toBe(`data:image/jpeg;base64,${jpeg}`);
    });

    it("refuses a hintless payload whose first bytes name no supported image", () => {
      for (const bytes of [
        Buffer.from("not really pixels, but a valid base64 body"),
        Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
        Buffer.from("GIF89a-----------"),
        Buffer.from([...PNG_MAGIC.slice(0, 7), 0x0b, 1, 2, 3, 4, 5]),
        Buffer.from([...WEBP_MAGIC.slice(0, 8), 0x57, 0x41, 0x56, 0x45]),
        Buffer.alloc(64),
      ]) {
        refused(imageGenerationsTransport, { data: [{ b64_json: bytes.toString("base64") }] });
      }
    });

    it("refuses, without throwing, a hintless payload too short to carry a signature", () => {
      for (const short of [
        Buffer.from([0xff]).toString("base64"),
        Buffer.from([0xff, 0xd8]).toString("base64"),
        Buffer.from(PNG_MAGIC.slice(0, 7)).toString("base64"),
        Buffer.from(WEBP_MAGIC.slice(0, 11)).toString("base64"),
      ]) {
        expect(() => imageGenerationsTransport.parseCompletion({ data: [{ b64_json: short }] })).not.toThrow();
        refused(imageGenerationsTransport, { data: [{ b64_json: short }] });
      }
    });

    it("lets the bytes win over a hint that disagrees with them", () => {
      // The hint is advisory. Believing a wrong one would declare the wrong type,
      // fail the byte gate's own type check, and discard a billed picture.
      expect(
        imageGenerationsTransport.parseCompletion({
          data: [{ b64_json: body(JPEG_MAGIC), output_format: "png" }],
        }).content,
      ).toBe(`data:image/jpeg;base64,${body(JPEG_MAGIC)}`);
      expect(
        imageGenerationsTransport.parseCompletion({
          data: [{ b64_json: SNIFFED_PNG }], output_format: "webp",
        }).content,
      ).toBe(`data:image/png;base64,${SNIFFED_PNG}`);
    });

    it("does not discard a good image because of a hint it cannot read", () => {
      for (const hint of ["tiff", "auto", "svg+xml", "constructor", 7, null, { toString: () => "png" }]) {
        expect(
          imageGenerationsTransport.parseCompletion({ data: [{ b64_json: SNIFFED_PNG, output_format: hint }] }).content,
        ).toBe(`data:image/png;base64,${SNIFFED_PNG}`);
      }
    });

    it("never lets a hint make non-image bytes usable", () => {
      refused(imageGenerationsTransport, { data: [{ b64_json: PAYLOAD, output_format: "png" }] });
      refused(imageGenerationsTransport, { data: [{ b64_json: PAYLOAD, output_format: "jpeg" }] });
    });

    it("yields an identical string for both shapes of the same image", () => {
      const a = imageChatTransport.parseCompletion(chat(`![image](data:image/png;base64,${SNIFFED_PNG})`));
      const b = imageGenerationsTransport.parseCompletion({ data: [{ b64_json: SNIFFED_PNG }] });
      expect(b.content).toBeDefined();
      expect(a.content).toBe(b.content);
    });

    it("accepts a markdown image with surrounding prose or a bare data URL", () => {
      expect(imageChatTransport.parseCompletion(chat(`Here:\n\n![image](${JPEG_URL})\n`)).content).toBe(JPEG_URL);
      expect(imageChatTransport.parseCompletion(chat(`  ${JPEG_URL}\n`)).content).toBe(JPEG_URL);
    });

    it("never accepts a provider URL as the result", () => {
      const only = refused(imageGenerationsTransport, { data: [{ url: "https://cdn.example/x.png" }] });
      expect(only.unusable).toBe("tool-or-continuation");
      const withNull = refused(imageGenerationsTransport, { data: [{ b64_json: null, url: "https://cdn.example/x.png" }] });
      expect(withNull.unusable).toBe("tool-or-continuation");
      const markdown = refused(imageChatTransport, chat("![image](https://cdn.example/x.png)"));
      expect(markdown.unusable).toBe("tool-or-continuation");
    });

    it("prefers the bytes when both bytes and a URL are present, and never returns the URL", () => {
      const parsed = imageGenerationsTransport.parseCompletion({
        data: [{ b64_json: SNIFFED_PNG, url: "https://cdn.example/x.png" }],
      });
      expect(parsed.content).toBe(`data:image/png;base64,${SNIFFED_PNG}`);
    });

    it("refuses a non-image data URL", () => {
      const html = `data:text/html;base64,${PAYLOAD}`;
      refused(imageChatTransport, chat(`![image](${html})`));
      refused(imageChatTransport, chat(html));
      refused(imageGenerationsTransport, { data: [{ b64_json: html }] });
    });

    it("refuses a malformed data URL header", () => {
      for (const header of [
        "data:image/;base64,",
        "data:image/png;charset=utf-8;base64,",
        "data:image/png,",
        "data:image/PNG;base64,",
        "data:image/png;base64 ,",
        "data:image/p ng;base64,",
      ]) {
        refused(imageChatTransport, chat(`![image](${header}${PAYLOAD})`));
      }
    });

    it("refuses a bad base64 alphabet, padding, or length", () => {
      for (const bad of [
        "AAAA*AAA",
        "AAAA AAAA",
        "AAAA\nAAAA",
        "AAAA-_AA",
        "AAA",
        "A===",
        "AA=A",
        "====",
        "",
      ]) {
        refused(imageChatTransport, chat(`![image](data:image/png;base64,${bad})`));
        refused(imageGenerationsTransport, { data: [{ b64_json: bad }] });
      }
    });

    it("refuses two data-URL images as ambiguous", () => {
      refused(imageChatTransport, chat(`![a](${JPEG_URL}) ![b](${PNG_URL})`));
    });

    it("refuses missing, empty, null and array envelopes without throwing", () => {
      for (const payload of [
        {},
        { choices: [] },
        { choices: null },
        { choices: {} },
        { choices: [null] },
        { choices: [[]] },
        { choices: [{}] },
        { choices: [{ message: null }] },
        chat(undefined),
        chat(null),
        chat(""),
        chat([]),
        chat({ type: "image_url" }),
        chat("no image at all"),
      ]) {
        expect(() => imageChatTransport.parseCompletion(payload)).not.toThrow();
        refused(imageChatTransport, payload);
      }
      for (const payload of [
        {},
        { data: [] },
        { data: null },
        { data: {} },
        { data: "x" },
        { data: [null] },
        { data: [[]] },
        { data: [{}] },
        { data: [{ b64_json: "" }] },
        { data: [{ b64_json: null }] },
        { data: [{ b64_json: 7 }] },
        { data: [{ url: "" }] },
      ]) {
        expect(() => imageGenerationsTransport.parseCompletion(payload)).not.toThrow();
        refused(imageGenerationsTransport, payload);
      }
    });

    it("carries a relay refusal, tool call and truncation through the closed vocabulary", () => {
      expect(
        refused(imageChatTransport, chat(`![image](${PNG_URL})`, { finish_reason: "content_filter" })).unusable,
      ).toBe("blocked-or-refused");
      expect(
        refused(imageChatTransport, chat(`![image](${PNG_URL})`, { finish_reason: "length" })).unusable,
      ).toBe("truncated");
      expect(
        refused(imageChatTransport, {
          choices: [{ message: { content: `![i](${PNG_URL})`, tool_calls: [{}] }, finish_reason: "stop" }],
        }).unusable,
      ).toBe("tool-or-continuation");
      expect(
        refused(imageChatTransport, {
          choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }],
        }).unusable,
      ).toBe("blocked-or-refused");
    });

    it("treats an absent stop report as complete only for a well-formed image", () => {
      const noStop = { choices: [{ message: { content: `![image](${PNG_URL})` } }] };
      expect(imageChatTransport.parseCompletion(noStop).disposition).toBe("complete");
      refused(imageChatTransport, { choices: [{ message: { content: "words" } }] });
    });

    it("never throws on hostile payloads", () => {
      let deep: unknown = {};
      for (let level = 0; level < 100_000; level += 1) deep = { a: deep, choices: [deep], data: [deep] };
      const throwing = new Proxy({}, {
        get() { throw new Error("hostile getter"); },
        has() { throw new Error("hostile has"); },
        ownKeys() { throw new Error("hostile keys"); },
      });
      const huge = "A".repeat(10 * 1024 * 1024);
      const hostile: unknown[] = [
        undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, true, false, "", "x", Symbol("s"), 1n,
        [], [[]], [null], [{}], {}, deep, throwing, () => 1,
        { choices: throwing }, { data: throwing }, { choices: [throwing] }, { data: [throwing] },
        { choices: [{ message: throwing }] },
        { choices: [{ message: { content: huge } }] },
        { choices: [{ message: { content: "![".repeat(5_000_000) } }] },
        { choices: [{ message: { content: `![i](data:image/png;base64,${huge}` } }] },
        { choices: [{ message: { content: `![i](data:image/png;base64,${huge}!)` } }] },
        { data: [{ b64_json: huge }] },
        { data: [{ b64_json: `${huge}*` }] },
        { data: [{ b64_json: "data:".repeat(2_000_000) }] },
        { data: [{ url: huge }] },
        { data: [{ b64_json: PAYLOAD, output_format: { toString() { throw new Error("x"); } } }] },
      ];
      for (const payload of hostile) {
        for (const transport of [imageChatTransport, imageGenerationsTransport]) {
          let parsed: ReturnType<typeof transport.parseCompletion> | undefined;
          expect(() => { parsed = transport.parseCompletion(payload); }).not.toThrow();
          // Whatever the outcome, content is either a vetted data URL or absent.
          if (parsed?.unusable === undefined) {
            expect(parsed?.content).toMatch(/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/u);
          } else {
            expect(parsed.content).toBeUndefined();
          }
        }
      }
    });
  });

  describe("serialize", () => {
    it("puts the prompt in messages for the chat shape and sets nothing else", () => {
      const body = imageChatTransport.serialize(call("a fish"), 1_200, "gemini-x-image");
      expect(Object.keys(body).sort()).toEqual(["messages", "model"]);
      expect(body).toEqual({ model: "gemini-x-image", messages: [{ role: "user", content: "a fish" }] });
      expect(Object.keys((body.messages as readonly object[])[0]!).sort()).toEqual(["content", "role"]);
    });

    it("puts the prompt in prompt for the images shape with a fixed square size", () => {
      const body = imageGenerationsTransport.serialize(call("a fish"), 1_200, "gpt-image-x");
      expect(Object.keys(body).sort()).toEqual(["model", "n", "prompt", "size"]);
      expect(body).toEqual({ model: "gpt-image-x", prompt: "a fish", n: 1, size: "1024x1024" });
    });

    it("passes the prompt through byte for byte", () => {
      const prompt = "  line one\n\"quoted\" 漢字 \u0000 ${x}  ";
      expect((imageGenerationsTransport.serialize(call(prompt), 1, "m") as { prompt: string }).prompt).toBe(prompt);
      expect(
        (imageChatTransport.serialize(call(prompt), 1, "m") as { messages: { content: string }[] }).messages[0]!.content,
      ).toBe(prompt);
    });
  });

  describe("acceptsResponse", () => {
    const json = { "content-type": "application/json; charset=utf-8" };

    it("accepts a 200 JSON response", () => {
      for (const transport of [imageChatTransport, imageGenerationsTransport]) {
        expect(transport.acceptsResponse(new Response("{}", { status: 200, headers: json }))).toBe(true);
      }
    });

    it("rejects non-200 statuses", () => {
      for (const transport of [imageChatTransport, imageGenerationsTransport]) {
        for (const status of [201, 202, 204, 301, 400, 500]) {
          const body = status === 204 ? null : "{}";
          expect(transport.acceptsResponse(new Response(body, { status, headers: json }))).toBe(false);
        }
      }
    });

    it("rejects a non-JSON or missing content type", () => {
      for (const transport of [imageChatTransport, imageGenerationsTransport]) {
        expect(transport.acceptsResponse(new Response("{}", { status: 200, headers: { "content-type": "text/html" } }))).toBe(false);
        expect(transport.acceptsResponse(new Response("{}", { status: 200, headers: { "content-type": "image/png" } }))).toBe(false);
        expect(transport.acceptsResponse(new Response(null, { status: 200 }))).toBe(false);
      }
    });
  });
});
