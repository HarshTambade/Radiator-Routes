import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argumentIndex = process.argv.indexOf("--out");
const outputDirectory = path.resolve(
  repositoryRoot,
  argumentIndex === -1 ? "dist/npm-dependency-sources" : process.argv[argumentIndex + 1],
);

if (argumentIndex !== -1 && !process.argv[argumentIndex + 1]) {
  throw new Error("Pass a directory after --out.");
}

const lock = JSON.parse(await readFile(path.join(repositoryRoot, "package-lock.json"), "utf8"));
const packageEntries = Object.entries(lock.packages).filter(([lockPath, entry]) => lockPath && entry.resolved);
const artifacts = new Map();

for (const [lockPath, entry] of packageEntries) {
  const packageName = entry.name || lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length);
  const artifactKey = `${entry.resolved}\n${entry.integrity || ""}`;
  const artifact = artifacts.get(artifactKey) || {
    name: packageName,
    version: entry.version,
    resolved: entry.resolved,
    integrity: entry.integrity,
    license: entry.license || "See package source archive",
    lockPaths: [],
  };
  artifact.lockPaths.push(lockPath);
  artifacts.set(artifactKey, artifact);
}

const archiveDirectory = path.join(outputDirectory, "packages");
await mkdir(archiveDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });

function verifyIntegrity(bytes, integrity, packageName) {
  if (!integrity) {
    throw new Error(`Missing lockfile integrity for ${packageName}. Refusing to archive unverified source.`);
  }

  const supported = integrity.split(/\s+/).filter((value) => /^(sha512|sha384|sha256)-/.test(value));
  if (supported.length === 0) {
    throw new Error(`Unsupported integrity value for ${packageName}: ${integrity}`);
  }

  const strongestAlgorithm = ["sha512", "sha384", "sha256"].find((algorithm) =>
    supported.some((value) => value.startsWith(`${algorithm}-`)),
  );
  const expected = supported.find((value) => value.startsWith(`${strongestAlgorithm}-`)).slice(strongestAlgorithm.length + 1);
  const actual = createHash(strongestAlgorithm).update(bytes).digest("base64");
  if (actual !== expected) {
    throw new Error(`Integrity check failed for ${packageName}.`);
  }
}

const work = [...artifacts.values()];
let completed = 0;

async function archiveWorker() {
  while (work.length > 0) {
    const artifact = work.pop();
    const url = new URL(artifact.resolved);
    if (url.protocol !== "https:") {
      throw new Error(`Refusing non-HTTPS package source: ${artifact.resolved}`);
    }

    const safeName = artifact.name.replace(/^@/, "").replaceAll("/", "+");
    const integritySuffix = createHash("sha256").update(artifact.integrity).digest("hex").slice(0, 10);
    const fileName = `${safeName}-${artifact.version}-${integritySuffix}.tgz`;
    const bytes = await downloadWithRetry(url, artifact.name);
    verifyIntegrity(bytes, artifact.integrity, artifact.name);
    await writeFile(path.join(archiveDirectory, fileName), bytes);
    artifact.sourceArchive = `packages/${fileName}`;
    completed += 1;
    if (completed % 50 === 0 || completed === artifacts.size) {
      console.log(`Archived ${completed}/${artifacts.size} npm package sources`);
    }
  }
}

async function downloadWithRetry(url, packageName) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`Download returned HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`Could not download ${packageName} after three attempts: ${lastError}`);
}

await Promise.all(Array.from({ length: 8 }, () => archiveWorker()));

const sortedArtifacts = [...artifacts.values()].sort((left, right) =>
  `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
);
const manifest = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceLockfile: "package-lock.json",
  packageManager: "npm",
  packageCount: sortedArtifacts.length,
  packages: sortedArtifacts,
};

await writeFile(path.join(outputDirectory, "dependency-sources.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await copyFile(path.join(repositoryRoot, "package.json"), path.join(outputDirectory, "package.json"));
await copyFile(path.join(repositoryRoot, "package-lock.json"), path.join(outputDirectory, "package-lock.json"));
await copyFile(
  path.join(repositoryRoot, "scripts/use-npm-source-archive.mjs"),
  path.join(outputDirectory, "use-npm-source-archive.mjs"),
);

const notices = [
  "# Third-party npm source archive",
  "",
  `This directory contains ${sortedArtifacts.length} exact npm package source archives from package-lock.json. Each tarball was checked against its lockfile integrity value before it was saved. Package archives retain the upstream license files and notices they publish. The lockfile locations, versions, integrity values, and any license fields recorded in the lockfile are listed in dependency-sources.json.`,
  "",
  "| Package | Version | Declared license | Source archive |",
  "| --- | --- | --- | --- |",
  ...sortedArtifacts.map((entry) =>
    `| ${entry.name} | ${entry.version} | ${String(entry.license).replaceAll("|", "\\|")} | ${entry.sourceArchive} |`,
  ),
  "",
];
await writeFile(path.join(outputDirectory, "THIRD-PARTY-NPM.md"), `${notices.join("\n")}\n`);
await writeFile(
  path.join(outputDirectory, "OFFLINE-NPM.md"),
  [
    "# Reinstall npm dependencies from this source archive",
    "",
    "Extract this archive into the repository root at npm-dependency-sources/. It contains the package source tarballs, the matching package manifests and lockfile, and their integrity and license inventory.",
    "",
    "From the repository root, run node npm-dependency-sources/use-npm-source-archive.mjs. That writes a temporary package-lock.json using the local source tarballs and keeps the original registry lockfile beside it.",
    "Then run npm ci --offline. Afterward, restore the registry lockfile with node npm-dependency-sources/use-npm-source-archive.mjs --restore.",
    "",
    "Native build toolchains still need their platform SDKs. The release also includes the Tauri Rust and Capacitor Swift source archives when those platforms are built.",
    "",
  ].join("\n"),
);

console.log(`Wrote ${sortedArtifacts.length} verified package source archives to ${outputDirectory}`);
