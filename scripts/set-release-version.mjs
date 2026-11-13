import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
const buildNumber = process.argv[3];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error("Pass a stable semantic version without the leading v, such as 1.2.3.");
}
if (!buildNumber || !/^\d+$/.test(buildNumber)) {
  throw new Error("Pass a positive integer build number as the second argument.");
}

const packageJsonPath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const packageLock = JSON.parse(await readFile(packageLockPath, "utf8"));
packageJson.version = version;
packageLock.version = version;
packageLock.packages[""].version = version;
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`);

const tauriConfigPath = path.join(root, "src-tauri/tauri.conf.json");
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
tauriConfig.version = version;
await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoPath = path.join(root, "src-tauri/Cargo.toml");
const cargoToml = await readFile(cargoPath, "utf8");
await writeFile(cargoPath, cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`));

const gradlePath = path.join(root, "android/app/build.gradle");
let gradle = await readFile(gradlePath, "utf8");
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
await writeFile(gradlePath, gradle);

const xcodeProjectPath = path.join(root, "ios/App/App.xcodeproj/project.pbxproj");
let xcodeProject = await readFile(xcodeProjectPath, "utf8");
xcodeProject = xcodeProject.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
xcodeProject = xcodeProject.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
await writeFile(xcodeProjectPath, xcodeProject);

console.log(`Set native package versions to ${version} (build ${buildNumber}).`);
