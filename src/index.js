'use strict'
const crypto = require('crypto')

function generateLogicalName(functionName, event, config) {
	const suffix = crypto
		.createHash('md5')
		.update(JSON.stringify({ event, config }))
		.digest('hex')
		.substr(0, 5)

	return `Buttonize${functionName}${suffix}`
}

module.exports = class ServerlessButtonizePlugin {
	constructor(serverless) {
		const { provider, functions, custom } = serverless.service
		const { configSchemaHandler } = serverless

		configSchemaHandler.defineCustomProperties.bind(configSchemaHandler)({
			type: 'object',
			properties: {
				buttonize: {
					type: 'object',
					properties: {
						apiKey: {
							type: 'string'
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
			'before:package:finalize': () => {
				serverless.cli.log('Decorating with Buttonize resources...')

				const { buttonize: config } = custom

				const customResources = Object.entries(functions).reduce(
					(mAcc, [functionName, { events }]) =>
						events.reduce((acc, { buttonize: event }) => {
							const logicalName = generateLogicalName(
								functionName,
								event,
								config
							)
							console.log(functionName, event.path, event.method, config.apiKey)
							return {
								...acc,
								[logicalName]: {
									Type: 'Custom::Buttonize',
									Properties: {
										ServiceToken: 'buttonize-lambda-arn-here',
										...event
									}
								}
							}
						}, mAcc),
					{}
				)

				Object.assign(
					provider.compiledCloudFormationTemplate.Resources,
					customResources
				)
			}
		}
	}
}
