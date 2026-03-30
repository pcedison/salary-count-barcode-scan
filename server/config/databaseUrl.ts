export function shouldDisablePreparedStatements(databaseUrl: string): boolean {
  try {
    const parsedUrl = new URL(databaseUrl);

    return (
      parsedUrl.hostname.endsWith(".pooler.supabase.com") &&
      parsedUrl.port === "6543"
    );
  } catch {
    return false;
  }
}
