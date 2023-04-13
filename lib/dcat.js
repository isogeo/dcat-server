const path = require('path')
const { Transform } = require('stream')
const { chain } = require('lodash')
const JSONStream = require('JSONStream')
const pumpify = require('pumpify')
const got = require('got')

const ISOGEO_OPEN_URL = process.env.ISOGEO_OPEN_URL || 'https://open.isogeo.com'
const GDP_API_URL = process.env.GDP_API_URL || 'https://geodataprocess.api.isogeo.com/api'

if (!process.env.DCAT_SERVER_URL) {
  throw new Error('La variable d’environnement DCAT_SERVER_URL doit être définie')
}

function convertTagsToKeywords(tags) {
  return Object.keys(tags)
    .filter(t => t.startsWith('keyword:isogeo') || t.startsWith('keyword:group-theme'))
    .map(t => tags[t].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ - /g,"-").replace(/ /g,"-").toLowerCase())
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
  'jpeg',
  'gpkg',
  'png', 
  'pdf'
])

async function getUrlExtension(url, link = null) {
  let filename

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }

  if (url.startsWith(process.env.DCAT_SERVER_URL)) {
    let format = link.fileName.split('.').pop()
    return (format ? Array.from(LINK_EXTENSION_WHITELIST).filter(extension => format.includes(extension)) [0] : null)
  }
  else {
    const parsedUrl = new URL(url)
    const { pathname } = parsedUrl
    filename = pathname
  }

  const extensionPart = path.extname(filename)

  if (extensionPart.charAt(0) !== '.') {
    return
  }

  const extension = extensionPart.slice(1).toLowerCase()

  if (LINK_EXTENSION_WHITELIST.has(extension)) {
    return extension
  }

}

function getDownloadURL(resource, link, { shareId, shareToken }) {
  if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
    return link.url
  }

  if (link.url.startsWith('/resources/')) {
    return `${process.env.DCAT_SERVER_URL}/${shareId}/${shareToken}/download/${resource._id}/${link._id}`
  }

  return link.url
}

async function getDistributions(resource, { shareId, shareToken }) {
  let services = []
  const resourceServiceLayers = resource.serviceLayers ? resource.serviceLayers.filter(service => service.service && service.service.format.endsWith('wfs')) : []

  if (resourceServiceLayers.length > 0) {
    let servicesInfo = {}

    try {
      servicesInfo  = await got.post(GDP_API_URL + '/servicesParser/getAvailableServices', {
        json: ({ jsonData: { serviceLayers: resourceServiceLayers } })
      }).json()
    }
    catch(e){
      //console.log(e)
    }
    

    servicesInfo = servicesInfo.servicelayers && servicesInfo.servicelayers.length > 0 ? servicesInfo.servicelayers.filter(service => service.DCATqueryURLs) : []

    servicesInfo.forEach(s => {
      for (const [key, value] of Object.entries(s.DCATqueryURLs)) {
        services.push({
          '@type': 'dcat:Distribution',
          identifier: s.serviceId,
          title: s.layerTitle,
          format: key,
          downloadURL: value,
          modified: resource.modified
        })
      }
    })
  }

  let distributions = resource.links
    .filter(l => l.kind === 'data' && l.actions.includes('download'))

  distributions = await Promise.all(distributions
    .map(async (l) => {
      let format = await getUrlExtension(getDownloadURL(resource, l, { shareId, shareToken }),l)
      return ({
        '@type': 'dcat:Distribution',
        identifier: l._id,
        title: l.title,
        format: format,
        downloadURL: getDownloadURL(resource, l, { shareId, shareToken }),
        modified: resource.modified
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
    return 'http://purl.org/cld/freq/' + PERIODICITY_MAPPING[updateFrequency]
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
    accrualPeriodicity: getPeriodicity(resource.updateFrequency),
    modified : resource.modified,
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
