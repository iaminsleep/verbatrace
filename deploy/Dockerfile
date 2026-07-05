
FROM node:22-alpine AS model-fetch

WORKDIR /app
COPY speech-model.json diarization-model.json ./
COPY scripts/ scripts/
CMD ["node", "scripts/fetch-speech-model.mjs"]

FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
