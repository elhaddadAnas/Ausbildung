# Azubora

Find an Ausbildung in Germany, generate personalised applications with AI,
send them from your own mailbox and follow company replies in one place.

## Architecture

```
python-project/          Django project (Python)
├── manage.py
├── requirements.txt
├── config/              project settings, root URLs, WSGI
└── azubora/             the application, organised as MVC
    ├── models/          M — data model, one module per domain
    │   ├── user.py          accounts, roles, plan counters
    │   ├── profile.py       profile, CV, education, experience, skills
    │   ├── jobs.py          offers, favourites, applications, messages
    │   ├── preferences.py   SMTP/IMAP, auto-apply bot, notifications
    │   ├── billing.py       bank-transfer payments, AI usage
    │   ├── system.py        audit/system logs, background job records
    │   ├── base.py          base model + column helpers
    │   └── fields.py        Prisma-compatible UUID/timestamp fields
    ├── views/           V — presentation
    │   ├── serializers.py   model → JSON (camelCase, as the UI expects)
    │   └── responses.py     JSON/error responses
    ├── templates/       V — HTML templates
    ├── controllers/     C — request handlers, one module per feature
    │   ├── auth.py  profile.py  offers.py  applications.py  ai.py
    │   ├── messages.py  settings.py  subscription.py  admin.py
    │   ├── system.py        health check, cron trigger
    │   ├── pages.py         serves the UI pages, guards protected ones
    │   ├── session.py       login_required / admin_required, session cookie
    │   └── base.py          method dispatch, request parsing
    ├── services/        business logic used by controllers
    │   (Arbeitsagentur client, OpenAI, SMTP/IMAP, auto-apply, plans & credits…)
    ├── urls.py          routes: URL → controller
    ├── middleware.py    security headers, same-origin API protection
    ├── management/      commands: run_scheduler (worker), seed
    ├── migrations/
    └── tests/
frontend/                React UI (Next.js), compiled to static files that Django serves
packages/                Global Job Finder (separate sibling app, unchanged)
```

Request flow: `urls.py` → **controller** (checks access, parses input) →
**models** / **services** → **view** (JSON presenter or template).

- The UI in `frontend/` is compiled with `npm run build` into
  `frontend/out/`; the page controller serves those pages and redirects
  signed-out visitors from protected pages to `/login`.
- The worker (`python manage.py run_scheduler`) runs the auto-apply bot
  (every 30 s), the IMAP inbox sync (every 60 s) and subscription expiry
  (every 6 h). Run exactly one instance.

### Existing database

The models map onto the tables created by the former Prisma schema
(`"User"`, `"passwordHash"`, `TIMESTAMP(3)`…). Point `NEON_DATABASE_URL` at
the existing database and run:

```bash
python manage.py migrate --fake-initial
```

Keep the same `JWT_SECRET` and `SMTP_ENCRYPTION_KEY`: existing sessions,
bcrypt passwords and encrypted SMTP passwords stay valid.

## Local development

Requirements: Python 3.12+, Node.js 20.16+.

```bash
cp .env.example .env          # DJANGO_DEBUG=true; SQLite is used without NEON_DATABASE_URL

cd python-project
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed           # needs ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD
.venv/bin/python manage.py runserver      # http://localhost:8000

cd ../frontend
npm install
npm run dev                               # http://localhost:3000, proxies /api to Django
```

To serve the compiled UI from Django instead: `npm run build` in `frontend/`,
then open http://localhost:8000.

Background jobs: `.venv/bin/python manage.py run_scheduler`.

## Tests

```bash
cd python-project && .venv/bin/python manage.py test azubora
cd frontend && npm run lint && npm run typecheck
```

## Deployment

`docker compose up --build` starts the web server (gunicorn), the worker,
PostgreSQL and Redis. The image builds the UI, then runs
`migrate --fake-initial` before starting gunicorn.

`GET /api/cron/auto-apply` (header `Authorization: Bearer $CRON_SECRET`)
remains available for an external cron instead of, or in addition to, the
worker. `GET /api/health` reports database and configuration status.
