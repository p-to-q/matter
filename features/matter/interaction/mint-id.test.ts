import { describe, expect, it, vi } from "vitest";
import { mintId } from "./mint-id";

describe("browser id minting", () => {
  it("uses the browser UUID CSPRNG and emits one bounded material id", () => {
    const getRandomValues = vi.fn((array: Uint8Array) => array);

    expect(mintId("text_swap_request", {
      randomUUID: () => "01234567-89AB-4CDE-8FAB-0123456789AB",
      getRandomValues,
    })).toBe("text_swap_request_0123456789ab4cde8fab0123456789ab");
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it("falls back only to the browser byte CSPRNG", () => {
    expect(mintId("inquiry", {
      getRandomValues: (array) => {
        array.forEach((_, index) => { array[index] = index; });
        return array;
      },
    })).toBe("inquiry_000102030405060708090a0b0c0d0e0f");
  });

  it.each([
    ["throws", () => { throw new Error("unavailable"); }],
    ["is malformed", () => "not-a-uuid"],
  ])("uses secure bytes when randomUUID %s", (_, randomUUID) => {
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.fill(0xab);
      return array;
    });

    expect(mintId("inquiry", { randomUUID, getRandomValues }))
      .toBe(`inquiry_${"ab".repeat(16)}`);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(getRandomValues.mock.calls[0]![0]).toHaveLength(16);
  });

  it("accepts the longest prefix without exceeding the material id bound", () => {
    const prefix = `a${"b".repeat(94)}`;
    const id = mintId(prefix, {
      randomUUID: () => "01234567-89ab-4cde-8fab-0123456789ab",
    });

    expect(id).toBe(`${prefix}_0123456789ab4cde8fab0123456789ab`);
    expect(id).toHaveLength(128);
  });

  it("fails closed when neither Web Crypto primitive can mint an id", () => {
    expect(mintId("inquiry", {})).toBeNull();
    expect(mintId("inquiry", {
      randomUUID: () => { throw new Error("unavailable"); },
      getRandomValues: () => { throw new Error("unavailable"); },
    })).toBeNull();
  });

  it("refuses malformed or overlong prefixes before reading entropy", () => {
    const randomUUID = vi.fn(() => "01234567-89ab-4cde-8fab-0123456789ab");
    const source = { randomUUID };

    expect(mintId("bad-prefix", source)).toBeNull();
    expect(mintId(`a${"b".repeat(95)}`, source)).toBeNull();
    expect(randomUUID).not.toHaveBeenCalled();
  });
});
