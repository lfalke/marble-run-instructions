# Stufe 1: Anleitungen laden und Seiten als Bilder rendern
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY build/ build/
RUN python3 build/build.py --out /out/data --cache /tmp/cache

# Stufe 2: statische Seite ausliefern
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY --from=build /out/data /usr/share/nginx/html/data
