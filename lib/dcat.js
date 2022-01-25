const path = require('path')
const { Transform } = require('stream')
const { chain } = require('lodash')
const JSONStream = require('JSONStream')
const pumpify = require('pumpify')
const got = require('got')

const ISOGEO_OPEN_URL = process.env.ISOGEO_OPEN_URL || 'https://open.isogeo.com'
const GDP_API_URL = process.env.GDP_API_URL || 'https://geodataprocess.api.isogeo.com'

if (!process.env.DCAT_SERVER_URL) {
  throw new Error('La variable d’environnement DCAT_SERVER_URL doit être définie')
}

function convertTagsToKeywords(tags) {
  return Object.keys(tags)
    .filter(t => t.startsWith('keyword:isogeo') || t.startsWith('keyword:group-theme'))
    .map(t => t.slice(t.indexOf(':', t.indexOf(':') + 1) + 1))
}

function getLicense(resource) {
  const licenses = chain(resource.conditions).map(c => c.license?.name).uniq().compact().value()
  if (licenses.includes('Licence ouverte ETALAB 2.0') || licenses.includes('Licence ouverte ETALAB 1.0')) {
    return 'Licence Ouverte v2.0'
  }

  if (licenses.includes('ODbL 1.0 - Open Database Licence')) {
    return 'Open Database License (ODbL) 1.0'
  }
}

const LINK_EXTENSION_WHITELIST = new Set([
  'zip',
  'geojson',
  'csv',
  'tiff',
  'gz',
  'xls',
  'xlsx',
  'jp2',
  'ecw',
  'jpg',
  'gpkg'
])

async function getUrlExtension(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }

  if (url.startsWith(process.env.DCAT_SERVER_URL)) {
    const result = await got(url)
    let format = result.headers['content-type']
    console.log(format)
    let correctExtensions = Array.from(LINK_EXTENSION_WHITELIST).filter(extension => format.includes(extension))
    return correctExtensions[0]
  }
  else {
    const parsedUrl = new URL(url)
    const { pathname } = parsedUrl
    const extensionPart = path.extname(pathname)

    if (extensionPart.charAt(0) !== '.') {
      return
    }

    const extension = extensionPart.slice(1).toLowerCase()

    if (LINK_EXTENSION_WHITELIST.has(extension)) {
      return extension
    }
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
  const resourceServiceLayers = resource.serviceLayers ? resource.serviceLayers.filter(service => service.service && service.service.format.endsWith('fs')) : []

  if (resourceServiceLayers.length > 0) {
    const servicesInfo = await got.post(GDP_API_URL + '/api/servicesParser/getAvailableServices', {
      json: ({ jsonData: { serviceLayers: resourceServiceLayers } })
    }).json()

    services = servicesInfo.servicelayers && servicesInfo.servicelayers.length > 0 ? servicesInfo.servicelayers.filter(service => service.DCATqueryURL) : []
    services = services.map(s => ({
      '@type': 'dcat:Distribution',
      identifier: s.serviceId,
      title: s.layerTitle,
      format: 'geojson',
      downloadURL: s.DCATqueryURL,
      published: resource.modified
    }))
  }

  let distributions = resource.links
    .filter(l => l.kind === 'data' && l.actions.includes('download'))

  distributions = await Promise.all(distributions
    .map( async (l) => {
      let format = await getUrlExtension(getDownloadURL(resource, l, { shareId, shareToken }))
      return ({
      '@type': 'dcat:Distribution',
      identifier: l._id,
      title: l.title,
      format: format,
      downloadURL: getDownloadURL(resource, l, { shareId, shareToken }),
      published: resource.modified
    })
  }))

  distributions = distributions.filter(r => r.downloadURL)

  return [...distributions, ...services]
}

const PERIODICITY_MAPPING = {
  PT1H: 'hourly',
  PT6H: 'fourTimesADay',
  PT12H: 'semidaily',
  P1D: 'daily',
  P3D: 'semiweekly',
  P1W: 'weekly',
  P2W: 'biweekly',
  P1M: 'monthly',
  P2M: 'bimonthly',
  P3M: 'quarterly',
  P4M: 'threeTimesAYear',
  P6M: 'semiannual',
  P1Y: 'annual',
  P2Y: 'biennial',
  P3Y: 'triennial',
  P5Y: 'quinquennial'
}

function getPeriodicity(updateFrequency) {
  if (updateFrequency in PERIODICITY_MAPPING) {
    return PERIODICITY_MAPPING[updateFrequency]
  }

  return 'unknown'
}

function getTemporal(start, end) {
  return (start && end) ? start + '/' + end : null
}

function getOpenCatalogUrl(shareId, shareToken, resourceId) {
  return `${ISOGEO_OPEN_URL}/s/${shareId}/${shareToken}/r/${resourceId}`
}

function getDescription(resource, { shareId, shareToken }) {
  const parts = []

  if (resource.abstract) {
    parts.push(resource.abstract)
  }

  if (resource.collectionContext) {
    parts.push(
      `**Contexte de collecte**

${resource.collectionContext}`
    )
  }

  if (resource.collectionMethod) {
    parts.push(
      `**Méthode de collecte**

${resource.collectionMethod}`
    )
  }

  if (resource['feature-attributes'] && resource['feature-attributes'].length > 0) {
    const partHeader = `**Attributs**

| Champ | Alias | Type |
| --- | --- | --- |`

    const partRows = resource['feature-attributes']
      .map(a => `| \`${a.name}\` | ${a.alias || a.comment || ''} | \`${a.dataType}\` |`)

    parts.push([partHeader, ...partRows].join('\n'))
  }

  const ocUrl = getOpenCatalogUrl(shareId, shareToken, resource._id)

  parts.push(
    `Pour plus d’informations, consultez [la métadonnée sur le catalogue Isogeo](${ocUrl}).`
  )

  return parts.join('\n\n')
}

async function convertToDataset(resource, { shareId, shareToken }) {
  const errors = []

  const distribution = await getDistributions(resource, { shareId, shareToken })
  const dataset = {
    '@type': 'dcat:Dataset',
    identifier: resource._id,
    license: getLicense(resource),
    title: resource.title,
    description: getDescription(resource, { shareId, shareToken }),
    keyword: convertTagsToKeywords(resource.tags),
    temporal: getTemporal(resource.validFrom, resource.validTo),
    frequency: getPeriodicity(resource.updateFrequency),
    distribution
  }

  if (resource.type === 'service') {
    errors.push({ level: 'E', message: 'Type de ressource non supporté (service)' })
  }

  if (!dataset.license) {
    errors.push({ level: 'W', message: 'Aucune licence valide reconnue' })
  }

  if (!dataset.title) {
    errors.push({ level: 'E', message: 'Aucun titre associé' })
  }

  if (dataset.distribution.length === 0) {
    errors.push({ level: 'E', message: 'Aucune ressource téléchargeable n’a pu être construite' })
  }

  const isValid = !errors.some(e => e.level === 'E')

  return { dataset, isValid, errors, originalResource: resource }
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

function createTransformStream({ shareId, shareToken }) {
  return new Transform({
    async transform(resource, enc, cb) {
      const result = await convertToDataset(resource, { shareId, shareToken })
      cb(null, result)
    },
    objectMode: true
  })
}

function transformIntoDcat({ shareId, shareToken }) {
  return pumpify.obj(
    createTransformStream({ shareId, shareToken }),
    new Transform({
      async transform({ dataset, isValid }, enc, cb) {
        if (isValid) {
          return cb(null, dataset)
        }

        cb()
      },
      objectMode: true
    }),
    JSONStream.stringify(DCAT_OPEN, DCAT_SEP, DCAT_CLOSE)
  )
}

module.exports = { convertToDataset, transformIntoDcat, createTransformStream }
