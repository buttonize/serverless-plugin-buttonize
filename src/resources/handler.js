'use strict'

const response = require('cfn-response')

module.exports.handler = (event, context) => {
	console.log(JSON.stringify(event))
	response.send(event, context, 'SUCCESS', {}, 'karel123')
}
