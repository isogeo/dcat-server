const {Transform} = require('stream')
const pumpify = require('pumpify')
const {createTransformStream} = require('./dcat')

const ISOGEO_APP_URL = process.env.ISOGEO_APP_URL || 'https://app.isogeo.com'

const DEBUG_HTML_START = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vue expert DCAT</title>

    <!-- Bootstrap -->
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css" integrity="sha384-HSMxcRTRxnN+Bdg0JdbxYKrThecOKuH5zCYotlSAcp1+c8xmyTe9GYg1l9a69psu" crossorigin="anonymous">
  </head>
  <body>
    <div class="container">
      <h1>Vue expert DCAT</h1>
      <hr />`

const DEBUG_HTML_END = `
    </div>
  </body>
</html>`

function getErrorLevelColor(error) {
  if (error.level === 'E') {
    return 'danger'
  }

  if (error.level === 'W') {
    return 'warning'
  }

  return 'default'
}

function getErrorLevelLabel(error) {
  if (error.level === 'E') {
    return 'Erreur'
  }

  if (error.level === 'W') {
    return 'Avertissement'
  }

  return 'Information'
}

function computeBodyBlock(errors) {
  if (errors.length === 0) {
    return '<p>Aucune erreur détectée</p>'
  }

  const errorsRows = errors.map(
    e => `<li><span class="label label-${getErrorLevelColor(e)}">${getErrorLevelLabel(e)}</span> ${e.message}</li>`
  )

  return `<p>Liste des erreurs :</p>
  <ul>
    ${errorsRows.join('')}
  </ul>
  `
}

function transformIntoDebugPage({shareId, shareToken}) {
  let beginEmitted = false

  return pumpify.obj(
    createTransformStream({shareId, shareToken}),
    new Transform({
      transform(item, enc, cb) {
        if (!beginEmitted) {
          this.push(DEBUG_HTML_START)
          beginEmitted = true
        }

        const row = `<div class="panel panel-${item.isValid ? 'success' : 'danger'}">
          <div class="panel-heading">
            <h3 class="panel-title">
              <a href="${ISOGEO_APP_URL}/groups/${item.originalResource._creator._id}/resources/${item.originalResource._id}">
                ${item.originalResource.title || item.originalResource._id}
              </a>
            </h3>
          </div>
          <div class="panel-body">
            ${computeBodyBlock(item.errors)}
          </div>
        </div>`

        cb(null, row)
      },
      flush(cb) {
        this.push(DEBUG_HTML_END)
        cb()
      },
      objectMode: true
    })
  )
}

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

module.exports = {transformIntoDebugLog, transformIntoDebugPage}
