import { describe, expect, it } from "vitest";

import {
  getDatabaseProviderInfo,
  shouldDisablePreparedStatements,
} from "./databaseUrl";

describe("getDatabaseProviderInfo", () => {
  it("detects Supabase as an external PostgreSQL provider", () => {
    expect(
      getDatabaseProviderInfo(
        "postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
      ),
    ).toMatchObject({
      key: "supabase",
      isExternal: true,
      label: "外部 PostgreSQL（Supabase）",
    });
  });

  it("distinguishes local PostgreSQL from external PostgreSQL", () => {
    expect(
      getDatabaseProviderInfo("postgresql://user:pass@localhost:5432/postgres"),
    ).toMatchObject({
      key: "postgres",
      isExternal: false,
      label: "本機 PostgreSQL",
    });

    expect(
      getDatabaseProviderInfo("postgresql://user:pass@db.example.com:5432/postgres"),
    ).toMatchObject({
      key: "postgres",
      isExternal: true,
      label: "外部 PostgreSQL",
    });
  });
});

describe("shouldDisablePreparedStatements", () => {
  it("disables prepared statements for Supabase transaction pooler URLs", () => {
    expect(
      shouldDisablePreparedStatements(
        "postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
      ),
    ).toBe(true);
  });

  it("keeps prepared statements for non-pooler or session mode URLs", () => {
    expect(
      shouldDisablePreparedStatements(
        "postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      ),
    ).toBe(false);
    expect(
      shouldDisablePreparedStatements(
        "postgresql://user:pass@db.example.com:5432/postgres",
      ),
    ).toBe(false);
  });

  it("fails closed for invalid URLs", () => {
    expect(shouldDisablePreparedStatements("not-a-url")).toBe(false);
  });
});
