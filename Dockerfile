FROM node:16-alpine as deps
WORKDIR /opt/app
COPY ./package.json ./yarn.lock /opt/app

RUN yarn --prod

FROM node:alpine as runner

COPY . .
COPY --from=deps /opt/app/node_modules ./node_modules

ENV PORT=5000 \
    ISOGEO_API_URL=https://api.qa.isogeo.com/v1 \
    ISOGEO_TOKEN_URL=https://id.api.qa.isogeo.com/oauth/token \
    DCAT_SERVER_URL=http://localhost:5000 \
    ISOGEO_OPEN_URL=https://qa-isogeo-open.azurewebsites.net \
    ISOGEO_APP_URL=https://qa-isogeo-app.azurewebsites.net \
    GDP_API_URL=https://geodataprocess.api.isogeo.com


CMD yarn start