FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile
ARG API_INTERNAL_URL=https://bingoapi-production-e17b.up.railway.app
ENV API_INTERNAL_URL=$API_INTERNAL_URL
RUN pnpm build
ENV NODE_ENV=development
EXPOSE 3000 3001 4000
CMD ["pnpm","--filter","@bingo/web","start"]
