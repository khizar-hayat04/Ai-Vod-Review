#!/bin/sh
# Start the Flask backend (port 5000) and the Angular dev server (port 3000).
# The Angular dev server proxies /api/* to Flask via proxy.conf.json.
# Free the ports if a previous instance is still holding them (idempotent restarts).
for PORT in 3000 4200 5000; do
  PIDS=$(lsof -ti tcp:$PORT 2>/dev/null)
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null
done
sleep 1

PYTHON_BIN="./.venv/bin/python"
[ -x "$PYTHON_BIN" ] || PYTHON_BIN="python3"
"$PYTHON_BIN" web_app.py &
FLASK_PID=$!
trap "kill $FLASK_PID 2>/dev/null" EXIT
cd video-uploader-app && exec pnpm exec ng serve
