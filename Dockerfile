FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci \
    && npm install --no-save @rollup/rollup-linux-x64-gnu@4.60.0

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p backups logs \
    && chown -R node:node /app

USER node

EXPOSE 8080

CMD ["node", "dist/index.js"]
