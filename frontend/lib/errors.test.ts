import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { toErrorMessage } from "./errors";

describe("toErrorMessage", () => {
  it("returns ApiError message when available", () => {
    expect(toErrorMessage(new ApiError(400, "Invalid payload"), "Fallback")).toBe("Invalid payload");
  });

  it("returns Error message when available", () => {
    expect(toErrorMessage(new Error("Something failed"), "Fallback")).toBe("Something failed");
  });

  it("returns fallback when unknown type", () => {
    expect(toErrorMessage({ detail: "nope" }, "Fallback")).toBe("Fallback");
  });
});
