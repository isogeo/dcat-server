const {Readable} = require('stream')
const got = require('got')
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

async function getShare(apiUrl, accessToken, shareId, shareToken) {
  const response = await got(`${apiUrl}/shares/${shareId}`, {
    headers: {authorization: `Bearer ${accessToken}`},
    responseType: 'json'
  })

  const share = response.body

  if (share.urlToken !== shareToken) {
    throw new Error('Forbidden: invalid share token')
  }

  return share
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

module.exports = {getToken, getShare, getResources, getResourcesOffset, getResourcesStream}
