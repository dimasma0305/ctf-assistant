FROM node:latest

WORKDIR /app

COPY package.json package.json

RUN yarn install

COPY . .
COPY .env .env

RUN git config --global user.email "ubuntu@test"
RUN git config --global user.name "test"

CMD yarn start
