FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_FRONTEND_DEMO=false
ARG VITE_RUNTIME_ENABLED=true
ARG VITE_RUNTIME_API_BASE=/api/runtime
ENV VITE_FRONTEND_DEMO=$VITE_FRONTEND_DEMO
ENV VITE_RUNTIME_ENABLED=$VITE_RUNTIME_ENABLED
ENV VITE_RUNTIME_API_BASE=$VITE_RUNTIME_API_BASE
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
