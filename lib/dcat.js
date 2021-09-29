const {Transform} = require('stream')
const {chain} = require('lodash')
const JSONStream = require('JSONStream')
const pumpify = require('pumpify')

function convertTagsToKeywords(tags) {
  return Object.keys(tags)
    .filter(t => t.startsWith('keyword:isogeo'))
    .map(t => t.slice('keyword:isogeo:'.length))
}

function getLicense(resource) {
  const licenses = chain(resource.conditions).map(c => c.license?.name).uniq().compact().value()
  if (licenses.includes('Licence ouverte ETALAB 2.0')) {
    return 'etalab-2.0'
  }

  if (licenses.includes('ODbL 1.0 - Open Database Licence')) {
    return 'ODbL-1.0'
  }
}

function getDistributions(resource) {
  return resource.links
    .filter(l => l.kind === 'data' && l.actions.includes('download'))
    .map(l => ({
      '@type': 'dcat:Distribution',
      identifier: l._id,
      title: l.title,
      downloadURL: l.url
    }))
}

function convertToDataset(resource) {
  const dataset = {
    '@type': 'dcat:Dataset',
    identifier: resource._id,
    license: getLicense(resource),
    title: resource.title,
    description: resource.abstract,
    keyword: convertTagsToKeywords(resource.tags),
    temporal: null,
    accrualPeriodicity: null,
    distribution: getDistributions(resource)
  }

  return dataset
}

const DCAT_OPEN = `{
  "@context":"https://project-open-data.cio.gov/v1.1/schema/catalog.jsonld",
  "@type":"dcat:Catalog",
  "conformsTo":"https://project-open-data.cio.gov/v1.1/schema",
  "describedBy":"https://project-open-data.cio.gov/v1.1/schema/catalog.json",
  "dataset":[\n`
const DCAT_SEP = ',\n'
const DCAT_CLOSE = `]\n
}\n`

function transformIntoDcat() {
  return pumpify.obj(
    new Transform({
      transform(resource, enc, cb) {
        const dataset = convertToDataset(resource)

        if (dataset.distribution.length > 0) {
          return cb(null, dataset)
        }

        cb()
      },
      objectMode: true
    }),
    JSONStream.stringify(DCAT_OPEN, DCAT_SEP, DCAT_CLOSE)
  )
}

module.exports = {convertToDataset, transformIntoDcat}
