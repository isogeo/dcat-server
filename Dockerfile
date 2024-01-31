FROM node:16-alpine as deps
WORKDIR /opt/app
COPY ./package.json ./yarn.lock /opt/app/

RUN yarn --prod

FROM node:16-alpine as runner
COPY --from=deps /opt/app/node_modules ./node_modules
COPY . .

ENV PORT=5000 \
    ISOGEO_API_URL=https://api.qa.isogeo.com/v1 \
    ISOGEO_TOKEN_URL=https://id.api.qa.isogeo.com/oauth/token \
    DCAT_SERVER_URL=http://localhost:5000 \
    ISOGEO_OPEN_URL=https://qa-isogeo-open.azurewebsites.net \
    ISOGEO_APP_URL=https://qa-isogeo-app.azurewebsites.net \
    ISOGEO_CLIENT_ID=isogeo-dcat \
    GDP_API_URL=https://geodataprocess.api.isogeo.com  \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca.crt

CMD yarn start