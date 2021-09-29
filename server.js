#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const {Client} = require('./lib/api-client')
const {transformIntoDcat} = require('./lib/dcat')
const w = require('./lib/w')

const apiClient = new Client()

const app = express()

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.use(cors({origin: true}))

app.get('/:shareId/:shareToken', w(async (req, res) => {
  const {shareId, shareToken} = req.params
  const share = await apiClient.getShare(shareId)

  if (!share || share.urlToken !== shareToken) {
    return res.sendStatus(404)
  }

  const resourcesStream = await apiClient.getResourcesStream(shareId)
  res.type('application/json')
  resourcesStream.pipe(transformIntoDcat()).pipe(res)
}))

const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Start listening on port ${port}`)
})
