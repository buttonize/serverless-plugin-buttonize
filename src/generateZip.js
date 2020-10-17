'use strict'

// Heavily inspired by: https://github.com/serverless/serverless/blob/c106d5363830e9dc31a5714f56abfb26b0a5db37/lib/plugins/aws/customResources/generateZip.js

const os = require('os')
const path = require('path')
const { memoize } = require('lodash')
const childProcess = require('child_process')
const fse = require('fs-extra')
const { version } = require('../package')
const getTmpDirPath = require('serverless/lib/utils/fs/getTmpDirPath')
const createZipFile = require('serverless/lib/utils/fs/createZipFile')
const npmCommandDeferred = require('serverless/lib/utils/npm-command-deferred')

const srcDirPath = path.join(__dirname, 'resources')

module.exports = memoize(() => {
	const cachedZipFilePath = path.join(
		os.homedir(),
		'.serverless/cache/buttonize',
		version,
		'custom-resources.zip'
	)

	return fse
		.lstat(cachedZipFilePath)
		.then(
			stats => {
				if (stats.isFile()) return true
				return false
			},
			error => {
				if (error.code === 'ENOENT') return false
				throw error
			}
		)
		.then(isCached => {
			if (isCached) return cachedZipFilePath
			const ensureCachedDirDeferred = fse.ensureDir(
				path.dirname(cachedZipFilePath)
			)
			const tmpDirPath = getTmpDirPath()
			const tmpInstalledLambdaPath = path.resolve(tmpDirPath, 'buttonize')
			const tmpZipFilePath = path.resolve(tmpDirPath, 'buttonize.zip')
			return fse
				.copy(srcDirPath, tmpInstalledLambdaPath)
				.then(() => npmCommandDeferred)
				.then(
					npmCommand =>
						new Promise((resolve, reject) =>
							childProcess.exec(
								`${npmCommand} install --production`,
								{
									cwd: tmpInstalledLambdaPath
								},
								err => {
									if (err) {
										reject(err)
									}
									resolve()
								}
							)
						)
				)
				.then(() => ensureCachedDirDeferred)
				.then(() => createZipFile(tmpInstalledLambdaPath, tmpZipFilePath))
				.then(() => fse.move(tmpZipFilePath, cachedZipFilePath))
				.then(() => cachedZipFilePath)
		})
})
