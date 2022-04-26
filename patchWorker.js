// @ts-ignore
THREE = require("./three-onlymath.min")

const QuickEntity = {
	"0": require("./quickentity1136"),
	"3": require("./quickentity20"),
	"4": require("./quickentity"),

	"999": require("./quickentity")
}

const RPKG = require("./rpkg")

const fs = require("fs-extra")
const path = require("path")
const child_process = require("child_process")
const LosslessJSON = require("lossless-json")
const { xxhash3 } = require("hash-wasm")

require("clarify")

const { config, logger } = require("./core-singleton")
const { copyFromCache, copyToCache } = require("./utils")

const execCommand = function (/** @type {string} */ command) {
	logger.verbose(`Executing command ${command}`)
	child_process.execSync(command)
}

module.exports = async ({ tempHash, tempRPKG, tbluHash, tbluRPKG, chunkFolder, assignedTemporaryDirectory, patches, invalidatedData, mod }) => {
	fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory))

	if (
		!patches.every((patch) => !invalidatedData.some((a) => a.filePath == patch.path)) || // must redeploy, invalid cache
		!(await copyFromCache(mod, path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)), path.join(process.cwd(), assignedTemporaryDirectory))) // cache is not available
	) {
		let rpkgInstance = new RPKG.RPKGInstance()

		await rpkgInstance.waitForInitialised()

		const callRPKGFunction = async function (/** @type {string} */ command) {
			logger.verbose(`Executing RPKG function ${command}`)
			return await rpkgInstance.callFunction(command)
		}

		/* ---------------------------------------- Extract TEMP ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP"))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tempRPKG + ".rpkg")}" -filter "${tempHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP"))
			} catch {}
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta"))
		}

		/* ---------------------------------------- Extract TBLU ---------------------------------------- */
		if (!fs.existsSync(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU"))) {
			await callRPKGFunction(`-extract_from_rpkg "${path.join(config.runtimePath, tbluRPKG + ".rpkg")}" -filter "${tbluHash}" -output_path "${assignedTemporaryDirectory}"`)
		} else {
			try {
				fs.ensureDirSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU"))
			} catch {}
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU")) // Use the staging one (for mod compat - one mod can extract, patch and build, then the next can patch that one instead)
			fs.copyFileSync(path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU.meta"), path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta"))
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		execCommand(
			'"' +
				path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
				'" HM3 convert TEMP "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP") +
				'" "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP") +
				'.json" --simple'
		)
		execCommand(
			'"' +
				path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
				'" HM3 convert TBLU "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU") +
				'" "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU") +
				'.json" --simple'
		)
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta")}"`)
		await callRPKGFunction(`-hash_meta_to_json "${path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta")}"`) // Generate the RT files from the binary files

		/* ---------------------------------------- Convert to QN --------------------------------------- */
		if (Number(patches[0].patchVersion.value) < 3) {
			await QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(patches[0].patchVersion.value)) - 1]].convert(
				"HM3",
				"ids",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")
			) // Generate the QN json from the RT files
		} else {
			await QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(patches[0].patchVersion.value)) - 1]].convert(
				"HM3",
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tempRPKG, "TEMP", tempHash + ".TEMP.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, tbluRPKG, "TBLU", tbluHash + ".TBLU.meta.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json")
			) // Generate the QN json from the RT files
		}

		for (let patch of patches) {
			logger.debug("Applying patch " + patch.path)

			if (!QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(patch.patchVersion.value)) - 1]]) {
				rpkgInstance.exit()
				fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

				logger.error("Could not find matching QuickEntity version for patch version " + Number(patch.patchVersion.value) + "!")
			}

			fs.writeFileSync(path.join(process.cwd(), assignedTemporaryDirectory, "patch.json"), LosslessJSON.stringify(patch))

			/* ----------------------------------------- Apply patch ---------------------------------------- */
			await QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(patch.patchVersion.value)) - 1]].applyPatchJSON(
				path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "patch.json"),
				path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json")
			) // Patch the QN json
			fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"))
			fs.renameSync(path.join(process.cwd(), assignedTemporaryDirectory, "PatchedQuickEntityJSON.json"), path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"))
		}

		/* ------------------------------------ Convert to RT Source ------------------------------------ */
		await QuickEntity[Object.keys(QuickEntity)[Object.keys(QuickEntity).findIndex((a) => parseFloat(a) > Number(patches[0].patchVersion.value)) - 1]].generate(
			"HM3",
			path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json"),
			path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.json")
		) // Generate the RT files from the QN json

		/* -------------------------------------- Convert to binary ------------------------------------- */
		execCommand(
			'"' +
				path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
				'" HM3 generate TEMP "' +
				path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json") +
				'" "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP") +
				'" --simple'
		)
		execCommand(
			'"' +
				path.join(process.cwd(), "Third-Party", "ResourceTool.exe") +
				'" HM3 generate TBLU "' +
				path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json") +
				'" "' +
				path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU") +
				'" --simple'
		)
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.json")}"`)
		await callRPKGFunction(`-json_to_hash_meta "${path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.json")}"`) // Generate the binary files from the RT json

		fs.rmSync(path.join(process.cwd(), assignedTemporaryDirectory, "QuickEntityJSON.json"))
		fs.rmSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TEMP.json"))
		fs.rmSync(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta.json"))
		fs.rmSync(path.join(process.cwd(), assignedTemporaryDirectory, "temp.TBLU.json"))
		fs.rmSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta.json"))

		rpkgInstance.exit()

		await copyToCache(mod, path.join(process.cwd(), assignedTemporaryDirectory), path.join(chunkFolder, await xxhash3(patches[patches.length - 1].path)))
	} else {
		logger.debug("Restored patch chain ending in " + patches[patches.length - 1].path + " from cache")
	}

	/* ------------------------------------- Stage binary files ------------------------------------- */
	fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP"), path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP"))
	fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, tempHash + ".TEMP.meta"), path.join(process.cwd(), "staging", chunkFolder, tempHash + ".TEMP.meta"))
	fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU"), path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU"))
	fs.copyFileSync(path.join(process.cwd(), assignedTemporaryDirectory, tbluHash + ".TBLU.meta"), path.join(process.cwd(), "staging", chunkFolder, tbluHash + ".TBLU.meta")) // Copy the binary files to the staging directory

	fs.removeSync(path.join(process.cwd(), assignedTemporaryDirectory))

	return
}
