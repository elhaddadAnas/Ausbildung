# Azubora — Django backend serving the compiled React UI.

# Step 1: compile the UI to static files (frontend/out)
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Step 2: Python runtime
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST=/app/frontend/out
WORKDIR /app/python-project

COPY python-project/requirements.txt ./
RUN pip install -r requirements.txt

COPY python-project/ ./
COPY --from=frontend /app/frontend/out /app/frontend/out

RUN useradd --system --uid 1001 azubora && mkdir -p /app/data/uploads && chown -R azubora /app/data
USER azubora

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status == 200 else 1)"

# Existing (Prisma-created) databases: migrate --fake-initial adopts the tables as they are.
CMD ["sh", "-c", "python manage.py migrate --fake-initial --noinput && exec gunicorn config.wsgi -b 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-3} --threads 4 --timeout 300 --access-logfile -"]
