import { describe, expect, it } from "vitest";

import { shouldDisablePreparedStatements } from "./databaseUrl";

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
