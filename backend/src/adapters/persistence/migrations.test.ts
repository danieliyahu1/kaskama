import { createClient, type Client } from "@libsql/client";
import { applyMigrations, migrations, resetDatabase } from "./migrations.js";

/**
 * Applies migrations up to a version, so a test can create the pre-migration
 * data a later migration is meant to move.
 */
async function applyThrough(client: Client, maxVersion: number): Promise<void> {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  for (const migration of migrations.filter((m) => m.version <= maxVersion)) {
    await client.batch(
      [
        ...migration.statements.map((sql) => ({ sql, args: [] })),
        {
          sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
          args: [migration.version, migration.name, 1],
        },
      ],
      "write",
    );
  }
}

describe("database migrations", () => {
  it("applies each migration once and records its version", async () => {
    const client = createClient({ url: "file::memory:" });

    await applyMigrations(client);
    await applyMigrations(client);

    const versions = await client.execute(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    );
    expect(versions.rows).toEqual(
      migrations.map((migration) => ({
        version: migration.version,
        name: migration.name,
      })),
    );
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'posts'",
    );
    expect(tables.rows).toHaveLength(1);
  });

  it("resets data and reapplies the canonical schema", async () => {
    const client = createClient({ url: "file::memory:" });
    await applyMigrations(client);
    await client.execute({
      sql: "INSERT INTO profiles (address, display_name, is_public, updated_at) VALUES (?, ?, ?, ?)",
      args: ["kaspatest:reset", "Reset", 1, 1_000_000],
    });

    await resetDatabase(client);

    const profile = await client.execute(
      "SELECT * FROM profiles WHERE address = 'kaspatest:reset'",
    );
    expect(profile.rows).toHaveLength(0);
    const versions = await client.execute("SELECT version FROM schema_migrations");
    expect(versions.rows).toHaveLength(migrations.length);
  });

  it("enforces media uniqueness per creator", async () => {
    const client = createClient({ url: "file::memory:" });
    await applyMigrations(client);
    const insert = (id: string, creator: string) =>
      client.execute({
        sql: "INSERT INTO posts (id,creator,caption,price_sompi,media_type,media_size,media_digest,media_key,published_at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [id, creator, "caption", "1", "image/jpeg", 10, "shared-digest", "key", 1],
      });

    await insert("post-a", "kaspatest:a");
    await insert("post-b", "kaspatest:b");
    await expect(insert("post-c", "kaspatest:a")).rejects.toThrow();
  });

  it("drops the dead terminal-state column from both attempt tables", async () => {
    const client = createClient({ url: "file::memory:" });
    await applyMigrations(client);

    for (const table of ["payment_attempts", "membership_attempts"]) {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      expect(info.rows.map((row) => row.name)).not.toContain("finalized_at");
    }
  });

  it("re-arms attempts stranded terminal before settlement was atomic", async () => {
    const client = createClient({ url: "file::memory:" });
    await applyThrough(client, 21);
    // The pre-#6 ordering could claim an attempt terminal and then fail before
    // writing its effect. Those rows are still readable by id, so narrowing the
    // attempt state must move them back to SUBMITTED rather than leave a value
    // the new reader rejects.
    await client.execute({
      sql: `INSERT INTO payment_attempts
        (id,transaction_json,fingerprint,amount_sompi,creator,post_id,buyer,expires_at,state,transaction_id,finalized_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        "pay-stranded",
        "{}",
        "fp",
        "1",
        "kaspatest:creator",
        "post-1",
        "kaspatest:buyer",
        1_000,
        "CONFIRMED",
        "tx-1",
        5,
      ],
    });
    await client.execute({
      sql: `INSERT INTO membership_attempts
        (id,transaction_json,fingerprint,covenant_id,sign_inputs,creator,buyer,kind,expires_at,state,transaction_id,finalized_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        "mem-stranded",
        "{}",
        "fp",
        "covenant-1",
        "[1]",
        "kaspatest:creator",
        "kaspatest:buyer",
        "purchase",
        1_000,
        "REJECTED",
        "tx-2",
        5,
      ],
    });

    await applyMigrations(client);

    const payment = await client.execute({
      sql: "SELECT state FROM payment_attempts WHERE id=?",
      args: ["pay-stranded"],
    });
    expect(payment.rows[0]?.state).toBe("SUBMITTED");
    const membership = await client.execute({
      sql: "SELECT state FROM membership_attempts WHERE id=?",
      args: ["mem-stranded"],
    });
    expect(membership.rows[0]?.state).toBe("SUBMITTED");
  });
});
