const {Transform} = require('stream')
const pumpify = require('pumpify')
const {createTransformStream} = require('./dcat')

function transformIntoDebugLog({shareId, shareToken}) {
  return pumpify.obj(
    createTransformStream({shareId, shareToken}),
    new Transform({
      async transform({dataset, errors}, enc, cb) {
        errors.forEach(error => {
          this.push(`${dataset.identifier} | ${error.level} | ${error.message}\n`)
        })

        cb()
      },
      objectMode: true
    })
  )
}

module.exports = {transformIntoDebugLog}
