# Stage 1: download the instructions and render the pages as images
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY build/ build/
# Downloaded PDFs stay in the BuildKit cache between builds, so not everything is downloaded again each time
RUN --mount=type=cache,target=/cache python3 build/build.py --out /out/data --cache /cache

# Stage 2: serve the static site
FROM nginx:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site/ /usr/share/nginx/html/
COPY --from=build /out/data /usr/share/nginx/html/data
