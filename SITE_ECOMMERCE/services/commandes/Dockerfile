# TODO ETUDIANT : transformer en multi-stage build : DONE
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ ./
EXPOSE 3003
CMD ["node", "index.js"]
