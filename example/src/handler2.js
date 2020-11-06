'use strict'

module.exports.hello = async event => {
	console.log(event)
	return 'Nice, done, handler2'
}
