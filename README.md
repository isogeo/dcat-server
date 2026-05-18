# DCAT Server

| Builds | Deployments |
| ------ | ----------- |
|[![Build Status](https://dev.azure.com/isogeo/dcat-server/_apis/build/status%2Fdcat-server-main?repoName=isogeo%2Fdcat-server&branchName=master)](https://dev.azure.com/isogeo/dcat-server/_build/latest?definitionId=79&repoName=isogeo%2Fdcat-server&branchName=master) | [![Build Status](https://dev.azure.com/isogeo/dcat-server/_apis/build/status%2Fdcat-server-cd-saas?branchName=master)](https://dev.azure.com/isogeo/dcat-server/_build/latest?definitionId=158&branchName=master) |

DCAT server for Isogeo

## Deployments

| Environment | URL |
| ----------- | --- |
| Prod | https://dcat.isogeo.com/ |

## Prerequisites

- Node.js 14+
- yarn

## Local configuration

Environment variables are defined in a `.env` file. Copy `.env.sample` to `.env` and fill in the values.

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `ISOGEO_API_URL` | Isogeo API base URL | `https://api.isogeo.com/v1` |
| `ISOGEO_TOKEN_URL` | Isogeo token issuing URL | `https://id.api.isogeo.com/oauth/token` |
| `ISOGEO_CLIENT_ID` | Application client ID | |
| `ISOGEO_CLIENT_SECRET` | Application client secret | |
| `ISOGEO_OPEN_URL` | Isogeo Open Catalog URL | `https://open.isogeo.com` |
| `DCAT_SERVER_URL` | Public URL of the DCAT server | `http://localhost:5000` |
| `PORT` | HTTP listening port | `5000` |
| `GDP_API_URL` | Geodata Process API URL | `https://geodataprocess.api.isogeo.com/api` |
| `ISOGEO_APP_URL` | Isogeo application URL | `https://app.isogeo.com` |

## Installation

```bash
yarn          # dev

# or

yarn --prod   # production
```

## Available scripts

| Command | Description |
| ------- | ----------- |
| `yarn start` | Start the server |
| `yarn test` | Run unit tests ([ava](https://github.com/avajs/ava)) |
| `yarn lint` | Run linter ([xo](https://github.com/xojs/xo)) |

## Major libraries

| Library | Description |
| ------- | ----------- |
| [`Express`](https://www.npmjs.com/package/express) | HTTP server framework |
| [`got`](https://www.npmjs.com/package/got) | HTTP client |
| [`cors`](https://www.npmjs.com/package/cors) | CORS middleware |
| [`dotenv`](https://www.npmjs.com/package/dotenv) | Environment variables loader |
| [`lodash`](https://www.npmjs.com/package/lodash) | Utility library |
| [`morgan`](https://www.npmjs.com/package/morgan) | HTTP request logger |
| [`JSONStream`](https://www.npmjs.com/package/JSONStream) | Streaming JSON parser |
| [`pumpify`](https://www.npmjs.com/package/pumpify) | Stream pipeline combiner |

## Documentation

The DCAT feed for a given Isogeo share is available at:
`http://localhost:5000/:shareId/:urlToken`

## Useful links

* User guide: https://help.isogeo.com/doc-admin/features/publish/harvest_datagouv_fr/
