#!/bin/sh

if [ "$ENV" = "development" ]; then
    bun --hot index.ts
else
    bun run start
fi
