import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import RoleSelectPage from "./page";
import { translations } from "@/lib/i18n/translations";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("@/contexts/language-context", () => ({
  useLanguage: () => {
    const tr = translations.tr as Record<string, unknown>;
    const resolve = (key: string) =>
      key.split(".").reduce<unknown>((acc, part) => {
        if (typeof acc !== "object" || acc === null) return key;
        return (acc as Record<string, unknown>)[part] ?? key;
      }, tr);
    return {
      language: "tr",
      setLanguage: vi.fn(),
      t: (key: string) => {
        const value = resolve(key);
        return typeof value === "string" ? value : key;
      },
    };
  },
}));

describe("RoleSelectPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("rol tercihi yokken iki kart ve başlık gösterir", async () => {
    render(<RoleSelectPage />);
    await waitFor(() => {
      expect(screen.getByText("Sadece dosya yüklemek istiyorum")).toBeInTheDocument();
    });
    expect(screen.getByText("Boş diskimi kiraya vermek istiyorum")).toBeInTheDocument();
    expect(screen.getByText("DSN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dosya sahibi olarak devam et/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Depolama sağlayıcı olarak devam et/i })).toBeInTheDocument();
  });

  it("Dosya sahibi seçilince setRolePreference ve router.push çağrılır", async () => {
    render(<RoleSelectPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Dosya sahibi olarak devam et/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Dosya sahibi olarak devam et/i }));
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
    expect(window.localStorage.getItem("dsn_role")).toBe("consumer");
  });

  it("Depolama sağlayıcı seçilince router.push /agent ile çağrılır", async () => {
    render(<RoleSelectPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Depolama sağlayıcı olarak devam et/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Depolama sağlayıcı olarak devam et/i }));
    expect(mockPush).toHaveBeenCalledWith("/agent");
    expect(window.localStorage.getItem("dsn_role")).toBe("provider");
  });
});
