'use strict'

const { addCustomResourceToService } = require('./customResources')

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
					path: {
						type: 'string'
					},
					method: {
						type: 'string'
					}
				},
				required: ['path', 'method']
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
							(acc, { buttonize: { path, method } }) => ({
								...acc,
								[`Buttonize${getLambdaLogicalId(functionName)}`]: {
									Type: 'Custom::Buttonize',
									Properties: {
										ServiceToken: 'buttonize-lambda-arn-here',
										ApiKey: config.apiKey,
										path,
										method
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

				await addCustomResourceToService(awsProvider, config.logs, [])
			}
		}
	}
}
