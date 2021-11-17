const { Transform } = require('stream')
const { chain } = require('lodash')
const JSONStream = require('JSONStream')
const pumpify = require('pumpify')
const got = require('got')

if (!process.env.DCAT_SERVER_URL) {
  throw new Error('La variable d’environnement DCAT_SERVER_URL doit être définie')
}

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

function getDownloadURL(resource, link, { shareId, shareToken }) {
  if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
    return link.url
  }

  if (link.url.startsWith('/resources/')) {
    return `${process.env.DCAT_SERVER_URL}/${shareId}/${shareToken}/download/${resource._id}/${link._id}`
  }
}

async function getDistributions(resource, { shareId, shareToken }) {
  let services = []
  let resourceServiceLayers = resource.serviceLayers ? resource.serviceLayers.filter((service) => service.service && service.service.format.endsWith("fs")) : []

  if (resourceServiceLayers.length > 0) {
    let servicesInfo = await got.post(process.env.GDP_API_URL + '/api/servicesParser/getAvailableServices', {
      json: ({ jsonData: { serviceLayers: resourceServiceLayers } })
    }).json()

    services = servicesInfo.servicelayers && servicesInfo.servicelayers.length > 0 ? servicesInfo.servicelayers.filter(service => service.DCATqueryURL) : []
    services = services.map(s => ({
      '@type': 'dcat:Distribution',
      identifier: s.serviceId,
      title: s.layerTitle,
      downloadURL: s.DCATqueryURL
    }))
  }

  let distributions = resource.links
    .filter(l => l.kind === 'data' && l.actions.includes('download'))
    .map(l => ({
      '@type': 'dcat:Distribution',
      identifier: l._id,
      title: l.title,
      downloadURL: getDownloadURL(resource, l, { shareId, shareToken })
    }))
    .filter(r => r.downloadURL)

  return distributions.concat(services)
}

async function convertToDataset(resource, { shareId, shareToken }) {
  let distribution = await getDistributions(resource, { shareId, shareToken })
  const dataset = {
    '@type': 'dcat:Dataset',
    identifier: resource._id,
    license: getLicense(resource),
    title: resource.title,
    description: resource.abstract,
    keyword: convertTagsToKeywords(resource.tags),
    temporal: null,
    accrualPeriodicity: null,
    distribution: distribution
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

function transformIntoDcat({ shareId, shareToken }) {
  return pumpify.obj(
    new Transform({
      async transform(resource, enc, cb) {
        const dataset = await convertToDataset(resource, { shareId, shareToken })

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

module.exports = { convertToDataset, transformIntoDcat }
