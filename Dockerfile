FROM node:20-alpine
WORKDIR /app
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public/ ./public/
RUN mkdir -p data
ENV SHARE_TTL_DAYS=5 SHARE_MAX_FILES=100 SHARE_MAX_SIZE_MB=20
EXPOSE 8001
CMD ["node", "server.js"]
