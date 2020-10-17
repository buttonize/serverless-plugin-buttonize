'use strict'

// Heavily inspired by: https://github.com/serverless/serverless/blob/8c3c7c4e3a63aa9d4f04333f8c62cb0d333f3e49/lib/plugins/aws/customResources/index.js

const _ = require('lodash')
const path = require('path')
const crypto = require('crypto')
const fse = require('fs-extra')
const generateZip = require('./generateZip')

const prepareCustomResourcePackage = _.memoize(zipFilePath =>
	Promise.all([generateZip(), fse.mkdirs(path.dirname(zipFilePath))])
		.then(([cachedZipFilePath]) => fse.copy(cachedZipFilePath, zipFilePath))
		.then(() => path.basename(zipFilePath))
)

function addCustomResourceToService(
	awsProvider,
	shouldWriteLogs,
	iamRoleStatements
) {
	let absoluteFunctionName

	const { serverless } = awsProvider
	const { cliOptions } = serverless.pluginManager
	const providerConfig = serverless.service.provider
	const { Resources } = providerConfig.compiledCloudFormationTemplate
	const customResourcesRoleLogicalId =
		'IamRoleButtonizeCustomResourcesLambdaExecution'
	const zipFilePath = path.join(
		serverless.config.servicePath,
		'.serverless',
		'buttonize.zip'
	)
	const funcPrefix = `${serverless.service.service}-${cliOptions.stage}`
	const functionName = 'custom-resource-buttonize'
	const Handler = 'handler.handler'
	const customResourceFunctionLogicalId = awsProvider.naming.getLambdaLogicalId(
		functionName
	)

	absoluteFunctionName = `${funcPrefix}-${functionName}`
	if (absoluteFunctionName.length > 64) {
		// Function names cannot be longer than 64.
		// Temporary solution until we have https://github.com/serverless/serverless/issues/6598
		// (which doesn't change names of already deployed functions)
		absoluteFunctionName = `${absoluteFunctionName.slice(0, 32)}${crypto
			.createHash('md5')
			.update(absoluteFunctionName)
			.digest('hex')}`
	}

	return prepareCustomResourcePackage(zipFilePath).then(zipFileBasename => {
		let S3Bucket = {
			Ref: awsProvider.naming.getDeploymentBucketLogicalId()
		}
		if (serverless.service.package.deploymentBucket) {
			S3Bucket = serverless.service.package.deploymentBucket
		}
		const s3Folder = serverless.service.package.artifactDirectoryName
		const s3FileName = zipFileBasename
		const S3Key = `${s3Folder}/${s3FileName}`

		const cfnRoleArn = serverless.service.provider.cfnRole

		if (!cfnRoleArn) {
			let customResourceRole = Resources[customResourcesRoleLogicalId]
			if (!customResourceRole) {
				customResourceRole = {
					Type: 'AWS::IAM::Role',
					Properties: {
						AssumeRolePolicyDocument: {
							Version: '2012-10-17',
							Statement: [
								{
									Effect: 'Allow',
									Principal: {
										Service: ['lambda.amazonaws.com']
									},
									Action: ['sts:AssumeRole']
								}
							]
						},
						Policies: [
							{
								PolicyName: {
									'Fn::Join': [
										'-',
										[
											awsProvider.getStage(),
											awsProvider.serverless.service.service,
											'buttonize-custom-resources-lambda'
										]
									]
								},
								PolicyDocument: {
									Version: '2012-10-17',
									Statement: []
								}
							}
						]
					}
				}
				Resources[customResourcesRoleLogicalId] = customResourceRole

				if (shouldWriteLogs) {
					const logGroupsPrefix = awsProvider.naming.getLogGroupName(funcPrefix)
					customResourceRole.Properties.Policies[0].PolicyDocument.Statement.push(
						{
							Effect: 'Allow',
							Action: ['logs:CreateLogStream', 'logs:CreateLogGroup'],
							Resource: [
								{
									'Fn::Sub':
										'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
										`:log-group:${logGroupsPrefix}*:*`
								}
							]
						},
						{
							Effect: 'Allow',
							Action: ['logs:PutLogEvents'],
							Resource: [
								{
									'Fn::Sub':
										'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
										`:log-group:${logGroupsPrefix}*:*:*`
								}
							]
						}
					)
				}
			}
			const {
				Statement
			} = customResourceRole.Properties.Policies[0].PolicyDocument
			iamRoleStatements.forEach(newStmt => {
				if (
					!Statement.find(
						existingStmt => existingStmt.Resource === newStmt.Resource
					)
				) {
					Statement.push(newStmt)
				}
			})
		}

		const customResourceFunction = {
			Type: 'AWS::Lambda::Function',
			Properties: {
				Code: {
					S3Bucket,
					S3Key
				},
				FunctionName: absoluteFunctionName,
				Handler,
				MemorySize: 1024,
				Runtime: 'nodejs12.x',
				Timeout: 180
			},
			DependsOn: []
		}
		Resources[customResourceFunctionLogicalId] = customResourceFunction

		if (cfnRoleArn) {
			customResourceFunction.Properties.Role = cfnRoleArn
		} else {
			customResourceFunction.Properties.Role = {
				'Fn::GetAtt': [customResourcesRoleLogicalId, 'Arn']
			}
			customResourceFunction.DependsOn.push(customResourcesRoleLogicalId)
		}

		if (shouldWriteLogs) {
			const customResourceLogGroupLogicalId = awsProvider.naming.getLogGroupLogicalId(
				functionName
			)
			customResourceFunction.DependsOn.push(customResourceLogGroupLogicalId)
			const resourcesLogGroup = {
				[customResourceLogGroupLogicalId]: {
					Type: 'AWS::Logs::LogGroup',
					Properties: {
						LogGroupName: awsProvider.naming.getLogGroupName(
							absoluteFunctionName
						)
					}
				}
			}
			const logRetentionInDays = awsProvider.getLogRetentionInDays()
			if (logRetentionInDays) {
				resourcesLogGroup[
					customResourceLogGroupLogicalId
				].Properties.RetentionInDays = logRetentionInDays
			}
			Object.assign(Resources, resourcesLogGroup)
		}
	})
}

module.exports = {
	addCustomResourceToService
}
