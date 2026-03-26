#!/bin/bash
set -a; source <(tr -d '\r' < .env); set +a
docker rm -f "${CONTAINER_NAME}" 2>/dev/null
docker-compose up -d --build
