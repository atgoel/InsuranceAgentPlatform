# Phone access over HTTPS (dev)

A phone cannot reach `localhost`, and OIDC PKCE needs a secure context, so the `phone` profile puts Caddy (local CA, `tls internal`)
in front of the web app and Keycloak. Decision: ADR-008 decision 2. No tunnel is used, so dev Keycloak stays on your LAN.

## 1. Start
Set one variable, `IAP_PHONE_HOST`, to the PC's LAN IP (or a hostname the phone resolves). `infra/dev/phone.env` derives the rest
(Keycloak URL, token issuer, tenant host map).
```
# PowerShell                          # bash
$env:IAP_PHONE_HOST = "192.168.1.20"  export IAP_PHONE_HOST=192.168.1.20
docker compose -f infra/dev/docker-compose.yml --env-file infra/dev/phone.env --profile app --profile phone up -d --build
```
- `--build` is required: the OIDC authority is baked into the web image at build time.
- The one-shot `keycloak-phone` service adds `https://<host>/*` to the `iap-web` redirect URIs, web origins and post-logout URIs
  (idempotent, keeps existing entries, works on an imported or a persisted realm). Preview: `node infra/dev/keycloak/phone-client.mjs --host <host> --dry-run`.
- Open `https://<host>` on the phone (web) and `https://<host>:8443` is Keycloak (the sign-in redirect goes there).

## 2. Trust the local CA
```
docker compose -f infra/dev/docker-compose.yml cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```
Send `caddy-root.crt` to the phone (keep it out of git).
- Android: Settings > Security > Encryption and credentials > Install a certificate > CA certificate. Chrome then trusts it.
- iOS: open the file, Settings > Profile Downloaded > Install; then Settings > General > About > Certificate Trust Settings and
  enable full trust for "Caddy Local Authority". Without that step Safari still warns.
- Desktop: import the same file into the OS trust store (or accept the warning once).

## 3. Windows firewall
Allow inbound TCP 443 and 8443 on the private network (admin PowerShell):
```
New-NetFirewallRule -DisplayName "IAP phone HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443,8443 -Action Allow -Profile Private
```
The phone and the PC must be on the same network, and the IP must not change (use a DHCP reservation).

## 4. Things to know
- In phone mode the token issuer is `https://<host>:8443/realms/iap` for the desktop too. Use `https://<host>` on the PC as well;
  `http://localhost:8080` sign-in will fail with an issuer mismatch until you return to localhost mode.
- `localhost` stays in the tenant map, so core still resolves the tenant for local requests; core strips the port from `Host`.
- The CA lives in the `iap-caddy-data` volume and survives restarts; `down -v` creates a new CA (re-trust it on the phone).

## 5. Return to localhost mode
Unset the variable (`Remove-Item Env:IAP_PHONE_HOST` / `unset IAP_PHONE_HOST`) and run without `--env-file` and `--profile phone`:
```
docker compose -f infra/dev/docker-compose.yml --profile app up -d --build --remove-orphans
```
The extra redirect URIs stay in Keycloak; they are harmless.
