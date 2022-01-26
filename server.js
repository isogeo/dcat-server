#!/usr/bin/env node
require('dotenv').config()

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const {Client} = require('./lib/api-client')
const {transformIntoDcat} = require('./lib/dcat')
const {transformIntoDebugLog, transformIntoDebugPage} = require('./lib/debug')
const w = require('./lib/w')

const apiClient = new Client()

const app = express()

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.use(cors({origin: true}))

app.use('/:shareId/:shareToken', w(async (req, res, next) => {
  const {shareId, shareToken} = req.params

  if (shareId && shareToken) {
    const share = await apiClient.getShare(shareId)

    if (!share || share.urlToken !== shareToken) {
      return res.sendStatus(404)
    }

    req.share = share
  }

  next()
}))

app.get('/:shareId/:shareToken', w(async (req, res) => {
  const {shareId, shareToken} = req.params
  const resourcesStream = await apiClient.getResourcesStream(shareId)
  res.type('application/json')
  resourcesStream.pipe(transformIntoDcat({shareId, shareToken})).pipe(res)
}))

app.get('/:shareId/:shareToken/debug-log', w(async (req, res) => {
  const {shareId, shareToken} = req.params
  const resourcesStream = await apiClient.getResourcesStream(shareId)
  res.type('text/plain')
  resourcesStream.pipe(transformIntoDebugLog({shareId, shareToken})).pipe(res)
}))

app.get('/:shareId/:shareToken/debug-page', w(async (req, res) => {
  const {shareId, shareToken} = req.params
  const resourcesStream = await apiClient.getResourcesStream(shareId)
  res.type('text/html')
  resourcesStream.pipe(transformIntoDebugPage({shareId, shareToken})).pipe(res)
}))

app.get('/:shareId/:shareToken/download/:resourceId/:linkId', w(async (req, res) => {
  const {resourceId, linkId} = req.params
  const downloadStream = await apiClient.getDownloadStream(resourceId, linkId)
  downloadStream.on('error', function(e){
    res.status(404)
    res.json({"error" : "File doesn't exist"
  })})
  downloadStream.pipe(res)
}))

const port = process.env.PORT || 5000

app.listen(port, () => {
  console.log(`Start listening on port ${port}`)
})
