# Étape build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install --production

# Étape finale
FROM node:18-alpine
RUN apk add --no-cache wget curl
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
