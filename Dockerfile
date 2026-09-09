FROM node:22-slim

WORKDIR /app
ARG VITE_BASE_PATH=/pub_restaurant_tips/

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run db:generate && npm run build

ENV NODE_ENV=production
ENV PORT=8080
ENV APP_BASE_PATH=/pub_restaurant_tips

EXPOSE 8080
CMD ["npm", "run", "start"]
