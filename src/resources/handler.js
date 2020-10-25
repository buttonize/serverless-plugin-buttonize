'use strict'

const response = require('cfn-response')
const https = require('https')

module.exports.handler = (event, context) => {
	console.log(JSON.stringify(event))
	const data = JSON.stringify({ event })

	const options = {
		hostname: 'uozfy1nnpb.execute-api.eu-central-1.amazonaws.com',
		port: 443,
		path: '/dev/v1/custom-resource',
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': data.length,
			'x-api-key': event.ResourceProperties.ApiKey
		}
	}

	const req = https.request(options, res => {
		let data = ''

		res.on('data', chunk => {
			console.log('Receiving response...')
			data += chunk
		})

		res.on('end', () => {
			console.log(`Response code: ${res.statusCode}`)
			console.log('Response body:')
			console.log(data)
			if (res.statusCode < 200 || res.statusCode >= 300) {
				console.log(
					`Invalid HTTP response status code "${res.statusCode}" from Buttonize API`
				)
				response.send(
					event,
					context,
					event.RequestType === 'Delete' ? 'SUCCESS' : 'FAILED',
					{}
				)
			} else {
				context.done()
			}
		})
	})

	req.on('error', error => {
		console.error('Unexpected error:')
		console.error(error)
		response.send(
			event,
			context,
			event.RequestType === 'Delete' ? 'SUCCESS' : 'FAILED',
			{}
		)
	})

	req.write(data)
	req.end()
	console.log('Sending request...')
}
