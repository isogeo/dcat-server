const {Readable} = require('stream')
const got = require('got')
const ms = require('ms')
const getStream = require('get-stream')

const PAGINATION_SIZE = 20

async function getToken(tokenUrl, clientId, clientSecret) {
  const response = await got.post(tokenUrl, {
    username: clientId,
    password: clientSecret,
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: 'grant_type=client_credentials',
    responseType: 'json',
  })

  const expirationDate = new Date()
  expirationDate.setSeconds(expirationDate.getSeconds() + response.body.expires_in)

  return {
    value: response.body.access_token,
    expirationDate
  }
}

async function getShare(apiUrl, accessToken, shareId) {
  const response = await got(`${apiUrl}/shares/${shareId}`, {
    headers: {authorization: `Bearer ${accessToken}`},
    responseType: 'json'
  })

  return response.body
}

async function getResourcesOffset(apiUrl, accessToken, shareId, offset) {
  const response = await got(`${apiUrl}/resources/search`, {
    searchParams: {
      s: shareId,
      ob: '_created',
      _limit: PAGINATION_SIZE,
      _offset: offset,
      _include: 'links,serviceLayers,conditions'
    },
    headers: {authorization: `Bearer ${accessToken}`},
    responseType: 'json'
  })
  return response.body
}

function getResourcesStream(apiUrl, accessToken, shareId) {
  let offset = 0
  let finished = false

  return new Readable({
    highWaterMark: PAGINATION_SIZE,
    objectMode: true,
    async read() {
      if (finished) {
        return
      }

      const resp = await getResourcesOffset(apiUrl, accessToken, shareId, offset)

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

function getResources(apiUrl, accessToken, shareId) {
  return getStream.array(
    getResourcesStream(apiUrl, accessToken, shareId)
  )
}

class Client {
  constructor(params = {}) {
    this.tokenUrl = params.tokenUrl || process.env.ISOGEO_TOKEN_URL
    this.apiUrl = params.apiUrl || process.env.ISOGEO_API_URL
    this.clientId = params.clientId || process.env.ISOGEO_CLIENT_ID
    this.clientSecret = params.clientSecret || process.env.ISOGEO_CLIENT_SECRET
  }

  async getFreshToken() {
    if (this.token && (this.token.expirationDate - Date.now() > ms('10m'))) {
      return this.token.value
    }

    const token = await getToken(this.tokenUrl, this.clientId, this.clientSecret)
    this.token = token
    return token.value
  }

  async getShare(shareId) {
    const token = await this.getFreshToken()
    return getShare(this.apiUrl, token, shareId)
  }

  async getResourcesStream(shareId) {
    const token = await this.getFreshToken()
    return getResourcesStream(this.apiUrl, token, shareId)
  }
}

module.exports = {Client, getToken, getShare, getResources, getResourcesOffset, getResourcesStream}
