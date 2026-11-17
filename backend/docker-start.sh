#!/bin/sh
# Container entrypoint: migrate both databases, seed once, serve.
set -e
alembic upgrade head
alembic -x db=drill upgrade head
if python -c "from app.core.database import dbs; from app.models.disaster import Disaster; import sys; sys.exit(0 if dbs.live_session().query(Disaster).count() else 1)"; then
  echo "database already seeded"
else
  python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
