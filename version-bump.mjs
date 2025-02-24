import { readFileSync, writeFileSync, existsSync } from "fs";

const targetVersion = process.env.npm_package_version;

if (!targetVersion) {
	console.error(
		"Error: No version specified. Ensure this script is run via npm."
	);
	process.exit(1);
}

// Ensure manifest.json exists
if (!existsSync("manifest.json")) {
	console.error("Error: manifest.json not found.");
	process.exit(1);
}

try {
	// Read and update manifest.json
	let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
	const { minAppVersion } = manifest;
	manifest.version = targetVersion;

	writeFileSync("manifest.json", JSON.stringify(manifest, null, 2));

	console.log(`✅ Updated manifest.json → version: ${targetVersion}`);

	// Ensure versions.json exists
	if (!existsSync("versions.json")) {
		console.warn("Warning: versions.json not found. Creating a new one.");
		writeFileSync(
			"versions.json",
			JSON.stringify({ [targetVersion]: minAppVersion }, null, 2)
		);
	} else {
		// Read and update versions.json
		let versions = JSON.parse(readFileSync("versions.json", "utf8"));
		versions[targetVersion] = minAppVersion;

		writeFileSync("versions.json", JSON.stringify(versions, null, 2));
	}

	console.log(
		`✅ Updated versions.json → ${targetVersion}: ${minAppVersion}`
	);
} catch (error) {
	console.error("Error updating version files:", error);
	process.exit(1);
}
