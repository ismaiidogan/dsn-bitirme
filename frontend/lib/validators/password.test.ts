import { describe, expect, it } from "vitest";
import { validatePasswordRules } from "./password";

describe("validatePasswordRules", () => {
  it("returns null for valid password", () => {
    expect(validatePasswordRules("StrongPass1")).toBeNull();
  });

  it("fails for short password", () => {
    expect(validatePasswordRules("Ab1")).toBe("Şifre en az 8 karakter olmalı");
  });

  it("fails when uppercase letter is missing", () => {
    expect(validatePasswordRules("lowercase1")).toBe("Şifre en az 1 büyük harf içermeli");
  });

  it("fails when digit is missing", () => {
    expect(validatePasswordRules("PasswordOnly")).toBe("Şifre en az 1 rakam içermeli");
  });
});
