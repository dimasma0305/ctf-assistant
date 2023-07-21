FROM node:latest

WORKDIR /app

COPY package.json package.json

RUN yarn install

COPY . .
COPY .env .env

CMD yarn start
