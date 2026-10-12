FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .native-build-deps python3 make g++ \
  && npm ci \
  && apk del .native-build-deps
COPY . .
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run prisma:generate \
  && npm run build

FROM build AS migrator
CMD ["npm", "run", "prisma:migrate:deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
