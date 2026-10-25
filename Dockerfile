FROM node:22.23.3-alpine as deps
WORKDIR /opt/app

ARG NPM_TOKEN

COPY ./package.json ./yarn.lock /opt/app/
COPY .npmrc /opt/app/.npmrc

RUN export TOKEN=${NPM_TOKEN} && yarn --prod && rm .npmrc

FROM node:22.23.3-alpine as runner
COPY --from=deps /opt/app/node_modules ./node_modules
COPY . .
RUN rm .npmrc

ENV PORT=5000 \
    ISOGEO_API_URL=https://api.qa.isogeo.com/v1 \
    ISOGEO_TOKEN_URL=https://id.api.qa.isogeo.com/oauth/token \
    DCAT_SERVER_URL=http://localhost:5000 \
    ISOGEO_OPEN_URL=https://qa-isogeo-open.azurewebsites.net \
    ISOGEO_APP_URL=https://qa-isogeo-app.azurewebsites.net \
    ISOGEO_CLIENT_ID=isogeo-dcat \
    GDP_API_URL=https://qa.geodataprocess.api.isogeo.com  \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca.crt

CMD yarn start