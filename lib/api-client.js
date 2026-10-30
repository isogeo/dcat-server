const {Readable} = require('stream')
const {IsogeoClient} = require('@isogeo/sdk-js')

const PAGINATION_SIZE = 100
const RETRY_LIMIT = 2
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 521, 522, 524])
const RETRY_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'])

function masterRetryPolicy({status, code, retryAfter, attempt}) {
  const retryable = RETRY_STATUSES.has(status) || RETRY_CODES.has(code) || (status === 413 && retryAfter !== undefined)
  if (!retryable) {
    return undefined
  }

  return retryAfter ?? (1000 * (2 ** attempt)) + (Math.random() * 100)
}

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
        include: ['links', 'serviceLayers', 'conditions', 'feature-attributes'],
        maxRetries: RETRY_LIMIT,
        retryPolicy: masterRetryPolicy
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
      timeout: 0,
      reauthOn401: false
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
    return this.sdk.shares.get({shareId, maxRetries: RETRY_LIMIT, retryPolicy: masterRetryPolicy})
  }

  async getResourcesStream(shareId) {
    await this.connect()
    return getResourcesStream(this.sdk, shareId)
  }

  async getDownloadStream(resourceId, linkId) {
    await this.connect()
    return this.sdk.resources.links.download({resourceId, linkId})
  }
}

module.exports = {Client}
