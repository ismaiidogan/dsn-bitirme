import { describe, it, expect, beforeEach } from "vitest";
import {
  getRolePreference,
  setRolePreference,
  getRoleHomePath,
  type RolePreference,
} from "./role";

describe("getRoleHomePath", () => {
  it("provider için /agent döner", () => {
    expect(getRoleHomePath("provider")).toBe("/agent");
  });
  it("consumer için /dashboard döner", () => {
    expect(getRoleHomePath("consumer")).toBe("/dashboard");
  });
  it("both için /dashboard döner", () => {
    expect(getRoleHomePath("both")).toBe("/dashboard");
  });
  it("null için /dashboard döner", () => {
    expect(getRoleHomePath(null)).toBe("/dashboard");
  });
});

describe("getRolePreference / setRolePreference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("setledikten sonra getRolePreference aynı değeri döner", () => {
    setRolePreference("provider");
    expect(getRolePreference()).toBe("provider");
    setRolePreference("consumer");
    expect(getRolePreference()).toBe("consumer");
  });

  it("geçersiz değer sonrası null döner", () => {
    window.localStorage.setItem("dsn_role", "invalid");
    expect(getRolePreference()).toBeNull();
  });
});
