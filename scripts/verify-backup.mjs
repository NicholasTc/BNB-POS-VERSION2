import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { Pool } from "pg";
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== "/lisi_test" ||
  new URL(url).hostname !== "127.0.0.1" ||
  new URL(url).port !== "55439"
)
  throw new Error(
    "Backup verification requires the isolated Compose test database.",
  );
const name = "lisi_restore_check_" + randomBytes(6).toString("hex");
function docker(args, input) {
  const r = spawnSync("docker", ["compose", "exec", "-T", "test-db", ...args], {
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0)
    throw new Error("Backup verification command failed: " + args[0]);
  return r.stdout;
}
async function fingerprint(pool) {
  const tables = await pool.query(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE' ORDER BY table_schema,table_name",
  );
  const result = {};
  const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
  for (const t of tables.rows) {
    const key = t.table_schema + "." + t.table_name;
    const q = await pool.query(
      `SELECT count(*)::int AS count,md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) AS digest FROM ${quote(t.table_schema)}.${quote(t.table_name)} t`,
    );
    result[key] = q.rows[0];
  }
  const sequences = await pool.query(
    "SELECT schemaname,sequencename,last_value::text FROM pg_sequences WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,sequencename",
  );
  result.sequences = sequences.rows;
  return result;
}
const source = new Pool({
  connectionString: url,
  max: 1,
  idleTimeoutMillis: 0,
});
let restored,
  created = false;
try {
  await source.query("SET statement_timeout = '60s'");
  await source.query("SELECT pg_advisory_lock(891103)");
  const before = await fingerprint(source);
  const dump = docker([
    "pg_dump",
    "-U",
    "lisi_test",
    "-d",
    "lisi_test",
    "--format=custom",
    "--no-owner",
    "--no-acl",
  ]);
  docker(["createdb", "-U", "lisi_test", name]);
  created = true;
  docker(
    [
      "pg_restore",
      "-U",
      "lisi_test",
      "-d",
      name,
      "--no-owner",
      "--no-acl",
      "--single-transaction",
    ],
    dump,
  );
  const target = new URL(url);
  target.pathname = "/" + name;
  restored = new Pool({ connectionString: target.toString() });
  const after = await fingerprint(restored);
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error("Restored table/sequence fingerprints differ.");
  const integrity = await restored.query(
    "SELECT count(*)::int AS failures FROM sale s LEFT JOIN (SELECT sale_id,sum(subtotal) AS total,count(*) AS n FROM sale_line GROUP BY sale_id) l ON l.sale_id=s.id LEFT JOIN sale_discount d ON d.sale_id=s.id WHERE (l.total-COALESCE((d.snapshot->>'discount')::bigint,0)) IS DISTINCT FROM s.total OR l.n NOT BETWEEN 1 AND 50",
  );
  if (integrity.rows[0].failures)
    throw new Error("Restored sale integrity check failed.");
  const stockIntegrity = await restored.query(`
    SELECT
      (SELECT count(*) FROM stock_item i LEFT JOIN
        (SELECT stock_item_id,sum(delta) balance FROM stock_movement GROUP BY stock_item_id) m
        ON m.stock_item_id=i.id WHERE i.balance IS DISTINCT FROM COALESCE(m.balance,0))
      +
      (SELECT count(*) FROM
        (SELECT l.sale_id,u.stock_item_id,-sum(u.quantity) delta FROM stock_usage u
          JOIN sale_line l ON l.id=u.sale_line_id JOIN sale s ON s.id=l.sale_id
          WHERE s.status='completed' GROUP BY l.sale_id,u.stock_item_id) expected
        FULL JOIN (SELECT sale_id,stock_item_id,delta FROM stock_movement WHERE kind='sale') actual
          ON actual.sale_id=expected.sale_id AND actual.stock_item_id=expected.stock_item_id
        WHERE expected.delta IS DISTINCT FROM actual.delta) AS failures`);
  if (Number(stockIntegrity.rows[0].failures))
    throw new Error(
      "Restored stock balance or completed-sale usage differs from its ledger.",
    );
  const counts = await restored.query(
    "SELECT (SELECT count(*)::int FROM sale WHERE status='completed') AS completed,(SELECT count(*)::int FROM attendance) AS shifts",
  );
  console.log(
    JSON.stringify({
      backupRestore: "passed",
      tables: tablesCount(before),
      dumpBytes: dump.length,
      ...counts.rows[0],
      comparison:
        "all public/drizzle table row counts, content digests, sequences, sale totals and stock ledger/usage",
    }),
  );
} finally {
  await source.end();
  if (restored) await restored.end();
  if (created) docker(["dropdb", "-U", "lisi_test", name]);
}
function tablesCount(fingerprints) {
  return Object.keys(fingerprints).filter((k) => k !== "sequences").length;
}
