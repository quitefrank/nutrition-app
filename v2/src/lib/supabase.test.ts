import { describe, it, expect, vi, afterEach } from "vitest";

describe("supabase client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    await expect(import("@/lib/supabase")).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_URL"
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_ANON_KEY is missing", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(import("@/lib/supabase")).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  });

  it("throws with a descriptive message naming the missing variable", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    await expect(import("@/lib/supabase")).rejects.toThrow(
      /Missing required environment variables/
    );
  });
});
