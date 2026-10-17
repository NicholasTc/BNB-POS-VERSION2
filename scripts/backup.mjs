import { spawnSync } from "node:child_process";
import { mkdirSync, openSync, closeSync } from "node:fs";
const directory = "backups";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/lisi-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`;
const fd = openSync(path, "wx", 0o600);
try {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "db",
      "pg_dump",
      "-U",
      "lisi_dev",
      "-d",
      "lisi_dev",
      "--format=custom",
      "--no-owner",
      "--no-acl",
    ],
    { stdio: ["ignore", fd, "inherit"] },
  );
  if (result.error || result.status !== 0)
    throw new Error("Backup failed; do not use the incomplete file.");
  console.log(
    `Development backup saved: ${path}. Keep encrypted copies off this computer.`,
  );
} finally {
  closeSync(fd);
}
