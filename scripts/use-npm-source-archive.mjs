import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = process.cwd();
const archiveRoot = path.dirname(fileURLToPath(import.meta.url));
const lockPath = path.join(projectRoot, "package-lock.json");
const backupPath = path.join(projectRoot, "package-lock.registry.json");
const restore = process.argv.includes("--restore");

if (restore) {
  const originalLock = await readFile(backupPath);
  await writeFile(lockPath, originalLock);
  await unlink(backupPath);
  console.log("Restored package-lock.json to its registry URLs.");
} else {
  const manifest = JSON.parse(await readFile(path.join(archiveRoot, "dependency-sources.json"), "utf8"));
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  if (path.resolve(lockPath) === path.resolve(archiveRoot, "package-lock.json")) {
    throw new Error("Extract the archive into the project root as npm-dependency-sources first.");
  }
  const existingBackup = await readFile(backupPath).catch(() => null);
  if (existingBackup) throw new Error("package-lock.registry.json already exists; restore it before switching sources.");

  const archiveByLockPath = new Map();
  for (const artifact of manifest.packages) {
    for (const lockEntryPath of artifact.lockPaths) {
      archiveByLockPath.set(lockEntryPath, artifact.sourceArchive);
    }
  }

  for (const [lockEntryPath, entry] of Object.entries(lock.packages)) {
    if (!lockEntryPath || !entry.resolved) continue;
    const sourceArchive = archiveByLockPath.get(lockEntryPath);
    if (!sourceArchive) throw new Error(`No archived source is listed for ${lockEntryPath}.`);
    const absoluteSourcePath = path.join(archiveRoot, sourceArchive);
    const relativeSourcePath = path.relative(projectRoot, absoluteSourcePath).split(path.sep).join("/");
    entry.resolved = `file:${relativeSourcePath}`;
  }

  await copyFile(lockPath, backupPath);
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`Updated package-lock.json to use ${manifest.packageCount} local npm source archives.`);
  console.log("Run npm ci --offline, then use --restore to return to the original registry lockfile.");
}
