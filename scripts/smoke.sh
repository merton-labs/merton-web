#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"

umask 077
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

COOKIE_JAR="$TMP_DIR/cookies.txt"

echo "==> Waiting for stack at ${BASE_URL} ..."
ready=0
for _ in $(seq 1 30); do
	if curl -fsS "${BASE_URL}/" >/dev/null 2>&1 && curl -fsS "${BASE_URL}/api/v1/health" >/dev/null 2>&1; then
		ready=1
		break
	fi
	sleep 1
done

if [ "$ready" -ne 1 ]; then
	echo "ERROR: stack did not become ready at ${BASE_URL}" >&2
	exit 1
fi

echo "==> Checking GET / (HTML) ..."
root_status="$(curl -sS -D "$TMP_DIR/root.hdr" -o "$TMP_DIR/root.html" -w '%{http_code}' "${BASE_URL}/")"
if [ "$root_status" != "200" ]; then
	echo "ERROR: GET / returned status ${root_status} (expected 200)" >&2
	exit 1
fi
if ! grep -qi '^content-type:.*text/html' "$TMP_DIR/root.hdr"; then
	echo "ERROR: GET / did not return text/html Content-Type" >&2
	exit 1
fi
if ! grep -qi '<!doctype html>' "$TMP_DIR/root.html"; then
	echo "ERROR: GET / body did not contain <!doctype html>" >&2
	exit 1
fi

echo "==> Checking GET /api/v1/health ..."
health_status="$(curl -sS -o "$TMP_DIR/health.json" -w '%{http_code}' "${BASE_URL}/api/v1/health")"
if [ "$health_status" != "200" ]; then
	echo "ERROR: GET /api/v1/health returned status ${health_status} (expected 200)" >&2
	exit 1
fi
if ! grep -q '"status":"ok"' "$TMP_DIR/health.json"; then
	echo "ERROR: GET /api/v1/health did not report ok" >&2
	exit 1
fi

echo "==> Checking GET /api/v1/openapi.json ..."
openapi_status="$(curl -sS -o "$TMP_DIR/openapi.json" -w '%{http_code}' "${BASE_URL}/api/v1/openapi.json")"
if [ "$openapi_status" != "200" ]; then
	echo "ERROR: GET /api/v1/openapi.json returned status ${openapi_status} (expected 200)" >&2
	exit 1
fi
if ! grep -q '"openapi"' "$TMP_DIR/openapi.json" || ! grep -q '"Merton API"' "$TMP_DIR/openapi.json"; then
	echo "ERROR: GET /api/v1/openapi.json did not return expected OpenAPI document" >&2
	exit 1
fi

EMAIL="smoke-$(date +%s)-$$@example.com"
PASSWORD="$(openssl rand -hex 24)"
printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD" >"$TMP_DIR/credentials.json"
unset PASSWORD

echo "==> Registering throwaway user ${EMAIL} ..."
reg_status="$(
	curl -sS -o "$TMP_DIR/register.json" -w '%{http_code}' \
		-X POST \
		-H "Origin: ${BASE_URL}" \
		-H 'Content-Type: application/json' \
		--data-binary @"$TMP_DIR/credentials.json" \
		"${BASE_URL}/api/v1/auth/register"
)"
if [ "$reg_status" != "201" ]; then
	echo "ERROR: POST /api/v1/auth/register returned status ${reg_status} (expected 201)" >&2
	cat "$TMP_DIR/register.json" >&2 || true
	exit 1
fi
if ! grep -Fq "\"email\":\"${EMAIL}\"" "$TMP_DIR/register.json"; then
	echo "ERROR: POST /api/v1/auth/register response did not contain registered email" >&2
	exit 1
fi

echo "==> Logging in ..."
login_status="$(
	curl -sS -o "$TMP_DIR/login.json" -w '%{http_code}' \
		-c "$COOKIE_JAR" -b "$COOKIE_JAR" \
		-X POST \
		-H "Origin: ${BASE_URL}" \
		-H 'Content-Type: application/json' \
		--data-binary @"$TMP_DIR/credentials.json" \
		"${BASE_URL}/api/v1/auth/login"
)"
rm -f "$TMP_DIR/credentials.json"
if [ "$login_status" != "200" ]; then
	echo "ERROR: POST /api/v1/auth/login returned status ${login_status} (expected 200)" >&2
	cat "$TMP_DIR/login.json" >&2 || true
	exit 1
fi
if ! grep -Fq "\"email\":\"${EMAIL}\"" "$TMP_DIR/login.json"; then
	echo "ERROR: POST /api/v1/auth/login response did not contain user email" >&2
	exit 1
fi

echo "==> Fetching CSRF token (GET /api/v1/auth/csrf) ..."
csrf_status="$(
	curl -sS -o "$TMP_DIR/csrf.json" -w '%{http_code}' \
		-b "$COOKIE_JAR" \
		"${BASE_URL}/api/v1/auth/csrf"
)"
if [ "$csrf_status" != "200" ]; then
	echo "ERROR: GET /api/v1/auth/csrf returned status ${csrf_status} (expected 200)" >&2
	cat "$TMP_DIR/csrf.json" >&2 || true
	exit 1
fi
CSRF_TOKEN="$(sed -n 's/.*"csrf_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TMP_DIR/csrf.json")"
rm -f "$TMP_DIR/csrf.json"
if [ -z "$CSRF_TOKEN" ]; then
	echo "ERROR: GET /api/v1/auth/csrf returned empty csrf_token" >&2
	exit 1
fi
printf 'X-CSRF-Token: %s\n' "$CSRF_TOKEN" >"$TMP_DIR/csrf.hdr"
unset CSRF_TOKEN

echo "==> Checking current session (GET /api/v1/auth/me) ..."
me_status="$(
	curl -sS -o "$TMP_DIR/me.json" -w '%{http_code}' \
		-b "$COOKIE_JAR" \
		"${BASE_URL}/api/v1/auth/me"
)"
if [ "$me_status" != "200" ]; then
	echo "ERROR: GET /api/v1/auth/me returned status ${me_status} (expected 200)" >&2
	cat "$TMP_DIR/me.json" >&2 || true
	exit 1
fi
if ! grep -Fq "\"email\":\"${EMAIL}\"" "$TMP_DIR/me.json"; then
	echo "ERROR: GET /api/v1/auth/me response did not match ${EMAIL}" >&2
	exit 1
fi

echo "==> Logging out (POST /api/v1/auth/logout) ..."
logout_status="$(
	curl -sS -o "$TMP_DIR/logout.body" -w '%{http_code}' \
		-b "$COOKIE_JAR" -c "$COOKIE_JAR" \
		-X POST \
		-H "Origin: ${BASE_URL}" \
		-H @"$TMP_DIR/csrf.hdr" \
		"${BASE_URL}/api/v1/auth/logout"
)"
rm -f "$TMP_DIR/csrf.hdr"
if [ "$logout_status" != "204" ]; then
	echo "ERROR: POST /api/v1/auth/logout returned status ${logout_status} (expected 204)" >&2
	cat "$TMP_DIR/logout.body" >&2 || true
	exit 1
fi

echo "==> Verifying session is revoked after logout ..."
after_status="$(
	curl -sS -o /dev/null -w '%{http_code}' \
		-b "$COOKIE_JAR" \
		"${BASE_URL}/api/v1/auth/me"
)"
if [ "$after_status" != "401" ]; then
	echo "ERROR: GET /api/v1/auth/me after logout returned ${after_status} (expected 401)" >&2
	exit 1
fi

echo "==> Smoke test passed."

