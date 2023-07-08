FROM node:latest

WORKDIR /app
COPY . .
COPY .env .env
RUN yarn install

CMD yarn start
