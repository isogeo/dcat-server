const {Transform} = require('stream')
const {chain} = require('lodash')
const JSONStream = require('JSONStream')
const pumpify = require('pumpify')

const ISOGEO_OPEN_URL = process.env.ISOGEO_OPEN_URL || 'https://open.isogeo.com'

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

function getDownloadURL(resource, link, {shareId, shareToken}) {
  if (link.url.startsWith('http://') || link.url.startsWith('https://')) {
    return link.url
  }

  if (link.url.startsWith('/resources/')) {
    return `${process.env.DCAT_SERVER_URL}/${shareId}/${shareToken}/download/${resource._id}/${link._id}`
  }
}

function getDistributions(resource, {shareId, shareToken}) {
  return resource.links
    .filter(l => l.kind === 'data' && l.actions.includes('download'))
    .map(l => ({
      '@type': 'dcat:Distribution',
      identifier: l._id,
      title: l.title,
      downloadURL: getDownloadURL(resource, l, {shareId, shareToken})
    }))
    .filter(r => r.downloadURL)
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

function getOpenCatalogUrl(shareId, shareToken, resourceId) {
  return `${ISOGEO_OPEN_URL}/s/${shareId}/${shareToken}/r/${resourceId}`
}

function getDescription(resource, {shareId, shareToken}) {
  const parts = []

  if (resource.abstract) {
    parts.push(resource.abstract)
  }

  if (resource.collectionContext) {
    parts.push(
      `** Contexte de collecte **

${resource.collectionContext}`
    )
  }

  if (resource.collectionMethod) {
    parts.push(
      `** Méthode de collecte **

${resource.collectionMethod}`
    )
  }

  if (resource['feature-attributes'] && resource['feature-attributes'].length > 0) {
    const partHeader = `** Attributs **

| Champ | Alias | Type |
| --- | --- | --- |`

    const partRows = resource['feature-attributes']
      .map(a => `| \`${a.name}\` | ${a.alias || ''} | \`${a.dataType}\` |`)

    parts.push([partHeader, ...partRows].join('\n'))
  }

  const ocUrl = getOpenCatalogUrl(shareId, shareToken, resource._id)

  parts.push(
    `Pour plus d’informations, consultez [la métadonnée sur le catalogue Isogeo](${ocUrl}).`
  )

  return parts.join('\n\n')
}

function convertToDataset(resource, {shareId, shareToken}) {
  const dataset = {
    '@type': 'dcat:Dataset',
    identifier: resource._id,
    license: getLicense(resource),
    title: resource.title,
    description: getDescription(resource, {shareId, shareToken}),
    keyword: convertTagsToKeywords(resource.tags),
    temporal: null,
    accrualPeriodicity: getPeriodicity(resource.updateFrequency),
    distribution: getDistributions(resource, {shareId, shareToken})
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

function transformIntoDcat({shareId, shareToken}) {
  return pumpify.obj(
    new Transform({
      transform(resource, enc, cb) {
        const dataset = convertToDataset(resource, {shareId, shareToken})

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
