import { beforeEach, describe, expect, it, vi } from "vitest";
import { files, auth, setAccessToken, invalidateApiCache } from "./api";

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    invalidateApiCache();
    setAccessToken(null);
  });

  it("caches GET requests for files.list within ttl", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);

    await files.list();
    await files.list();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache on mutation request", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = typeof input === "string" ? input : input.toString();
      if (path.includes("/api/v1/files") && (!init?.method || init.method === "GET")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        } as Response);
      }
      if (path.includes("/api/v1/files/file-1") && init?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => ({}),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${path}`));
    });

    await files.list();
    await files.delete("file-1");
    await files.list();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes token and retries once on 401", async () => {
    setAccessToken("expired-token");
    const fetchMock = vi.spyOn(global, "fetch");
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Unauthorized" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "new-token", token_type: "bearer" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: "u1", email: "test@example.com" }),
      } as Response);

    const me = await auth.me();
    expect(me.email).toBe("test@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
