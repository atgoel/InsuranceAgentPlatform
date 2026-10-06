#!/bin/sh
# Writes /config.js from IAP_OIDC_AUTHORITY, IAP_OIDC_CLIENT_ID and IAP_DEMO_LOGIN (ADR-010).
set -eu

OUT=/usr/share/nginx/html/config.js

# JSON string: strip CR/LF, escape backslash and double quote.
json_string() {
  printf '%s' "$1" | tr -d '\r\n' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

fields=""
add_field() {
  if [ -n "$fields" ]; then fields="$fields, "; fi
  fields="$fields$1"
}

if [ -n "${IAP_OIDC_AUTHORITY:-}" ]; then
  add_field "\"oidcAuthority\": \"$(json_string "$IAP_OIDC_AUTHORITY")\""
fi
if [ -n "${IAP_OIDC_CLIENT_ID:-}" ]; then
  add_field "\"oidcClientId\": \"$(json_string "$IAP_OIDC_CLIENT_ID")\""
fi
if [ "${IAP_DEMO_LOGIN:-}" = "1" ]; then
  add_field "\"demoLogin\": true"
elif [ -n "${IAP_DEMO_LOGIN:-}" ]; then
  add_field "\"demoLogin\": false"
fi

printf 'window.__IAP_CONFIG__ = { %s };\n' "$fields" > "$OUT"
