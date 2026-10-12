import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getArchive } from "@/lib/server/archive";
import { UPDATE_LOGIC_VERSION } from "@/lib/server/update-engine";

async function main() {
  const [command, target, version = UPDATE_LOGIC_VERSION] =
    process.argv.slice(2);
  if (!["status", "backup", "replay"].includes(command)) {
    throw new Error(
      "Usage: archive status | backup <new-path> | replay <tournament-id|--all> [installed-version]",
    );
  }
  const archive = getArchive();
  try {
    if (command === "status") {
      console.log(
        JSON.stringify(
          {
            integrity: archive.db.pragma("quick_check"),
            tournaments: archive.db
              .prepare(
                "SELECT t.id, t.active_version, (SELECT COUNT(*) FROM snapshots s WHERE s.tournament_id=t.id) AS snapshots, (SELECT COUNT(*) FROM updates u WHERE u.tournament_id=t.id AND u.version=t.active_version) AS updates FROM tournaments t",
              )
              .all(),
          },
          null,
          2,
        ),
      );
    } else if (command === "backup") {
      if (!target || existsSync(target))
        throw new Error("Backup destination must be a new file");
      mkdirSync(dirname(resolve(target)), { recursive: true });
      await archive.db.backup(resolve(target));
      console.log(`Backup saved: ${resolve(target)}`);
    } else {
      if (!target) throw new Error("Specify a tournament ID or --all");
      if (version !== UPDATE_LOGIC_VERSION)
        throw new Error(
          `Installed update engine is ${UPDATE_LOGIC_VERSION}; an arbitrary version label cannot select different code`,
        );
      const ids =
        target === "--all" ? archive.summaries().map((t) => t.id) : [target];
      for (const id of ids)
        console.log(
          `${id}: rebuilt ${archive.replay(id, version)} updates using ${version}`,
        );
    }
  } finally {
    archive.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
