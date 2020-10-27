'use strict'

const path = require('path')
const { addCustomResourceToService } = require('./customResources')
const {
	uploadZipFile
} = require('serverless/lib/plugins/aws/deploy/lib/uploadArtifacts')
const { version } = require('../package')

module.exports = class ServerlessButtonizePlugin {
	constructor(serverless) {
		const { provider, functions, custom } = serverless.service
		const { configSchemaHandler } = serverless

		const isDisabled = provider.name !== 'aws'

		if (isDisabled) {
			serverless.cli.log(
				'serverless-plugin-buttonize supports only "aws" provider',
				'Buttonize',
				{ color: 'red' }
			)
		}

		configSchemaHandler.defineCustomProperties.bind(configSchemaHandler)({
			type: 'object',
			properties: {
				buttonize: {
					type: 'object',
					properties: {
						apiKey: {
							type: 'string'
						},
						logs: {
							type: 'boolean'
						}
					},
					required: ['apiKey']
				}
			},
			required: ['buttonize']
		})

		configSchemaHandler.defineFunctionEvent.bind(configSchemaHandler)(
			'aws',
			'buttonize',
			{
				type: 'object',
				properties: {
					label: {
						type: 'string'
					},
					namespace: {
						type: 'string'
					}
				},
				required: []
			}
		)

		this.hooks = {
			'before:package:finalize': async () => {
				if (isDisabled) {
					return
				}

				const { aws: awsProvider } = serverless.providers

				serverless.cli.log('Decorating CloudFormation template...', 'Buttonize')

				const getLambdaLogicalId = awsProvider.naming.getLambdaLogicalId.bind(
					awsProvider.naming
				)
				const { buttonize: config } = custom

				const customResources = Object.entries(functions).reduce(
					(mAcc, [functionName, { events }]) =>
						events.reduce(
							(acc, { buttonize: { label, namespace } }) => ({
								...acc,
								[`Buttonize${getLambdaLogicalId(functionName)}`]: {
									Type: 'Custom::Buttonize',
									Properties: {
										ServiceToken: {
											'Fn::GetAtt': [
												awsProvider.naming.getLambdaLogicalId(
													'custom-resource-buttonize'
												),
												'Arn'
											]
										},
										ApiKey: config.apiKey,
										PluginVersion: version,
										Label:
											typeof label !== 'undefined' ? `${label}` : functionName,
										Namespace:
											typeof namespace !== 'undefined' ? `${namespace}` : `\\`,
										Target: {
											'Fn::GetAtt': [
												awsProvider.naming.getLambdaLogicalId(functionName),
												'Arn'
											]
										}
									}
								}
							}),
							mAcc
						),
					{}
				)

				Object.assign(
					provider.compiledCloudFormationTemplate.Resources,
					customResources
				)
				serverless.cli.log('Packaging CustomResources...', 'Buttonize')
				await addCustomResourceToService(awsProvider, config.logs, [])
			},
			'after:aws:deploy:deploy:uploadArtifacts': async () => {
				const { aws: awsProvider } = serverless.providers

				const artifactFilePath = path.join(
					serverless.config.servicePath,
					'.serverless',
					'buttonize.zip'
				)

				if (serverless.utils.fileExistsSync(artifactFilePath)) {
					serverless.cli.log('Uploading CustmoResources...', 'Buttonize')
					return uploadZipFile.bind({
						serverless,
						provider: awsProvider,
						bucketName: await awsProvider.getServerlessDeploymentBucketName()
					})(artifactFilePath)
				}
			}
		}
	}
}
