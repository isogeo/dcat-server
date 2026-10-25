const {Readable} = require('stream')
const {IsogeoClient} = require('@isogeo/sdk-js')

const PAGINATION_SIZE = 100

function getResourcesStream(sdk, shareId) {
  let offset = 0
  let finished = false

  return new Readable({
    highWaterMark: PAGINATION_SIZE,
    objectMode: true,
    async read() {
      if (finished) {
        return
      }

      const resp = await sdk.resources.search({
        share: shareId,
        orderBy: '_created',
        limit: PAGINATION_SIZE,
        offset,
        include: ['links', 'serviceLayers', 'conditions', 'feature-attributes']
      })

      if (resp.offset + PAGINATION_SIZE >= resp.total) {
        finished = true
        resp.results.forEach(r => this.push(r))
        this.push(null)
      } else {
        offset += PAGINATION_SIZE
        resp.results.forEach(r => this.push(r))
      }
    }
  })
}

class Client {
  constructor(params = {}) {
    const tokenUrl = params.tokenUrl || process.env.ISOGEO_TOKEN_URL
    this.sdk = new IsogeoClient({
      idUrl: tokenUrl.replace(/\/oauth\/token$/, ''),
      apiUrl: params.apiUrl || process.env.ISOGEO_API_URL,
      maxRetries: 2
    })
    this.clientId = params.clientId || process.env.ISOGEO_CLIENT_ID
    this.clientSecret = params.clientSecret || process.env.ISOGEO_CLIENT_SECRET
  }

  async connect() {
    if (!(await this.sdk.auth.getValidToken())) {
      await this.sdk.auth.clientCredentials({client_id: this.clientId, client_secret: this.clientSecret})
    }
  }

  async getShare(shareId) {
    await this.connect()
    return this.sdk.shares.get({shareId})
  }

  async getResourcesStream(shareId) {
    await this.connect()
    return getResourcesStream(this.sdk, shareId)
  }

  async getDownloadStream(resourceId, linkId) {
    await this.connect()
    return this.sdk.resources.links.download({resourceId, linkId, timeout: {response: 120000}})
  }
}

module.exports = {Client}
