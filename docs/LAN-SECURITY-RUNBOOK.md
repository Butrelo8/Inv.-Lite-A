# LAN Security Runbook (Trusted Enclosure)

Use this checklist to confirm the app is reachable only by trusted local users, not by the public internet.

## 1) Bind and port exposure

- Confirm app bind host is controlled by `BIND_HOST`.
- For local-only host access, use `BIND_HOST=127.0.0.1`.
- For Docker container networking, the app may use `BIND_HOST=0.0.0.0` inside the container, but host publication must stay local-only.

## 2) Docker port mapping (host side)

- In `docker-compose.yml`, map app port to localhost only:
  - `127.0.0.1:5000:5000`
- Do not publish `0.0.0.0:5000:5000` unless you intentionally need LAN access and have reviewed firewall/router rules.

Quick checks:

- `docker ps` -> verify app container is running.
- `docker port <app_container_name>` -> verify mapping is `127.0.0.1:5000`.

## 3) Host firewall and router

- Ensure host firewall does not allow inbound `5000` from public networks.
- Ensure router has no port forwarding rule for TCP `5000` to this machine.
- If UPnP is enabled on router, verify no automatic rule exposed this port.

## 4) Tunnel and remote-access audit

- Confirm no active public tunnel forwards app traffic:
  - Tailscale Funnel
  - ngrok / cloudflared tunnel / similar
- If Tailscale is used, prefer identity-restricted sharing only; never unauthenticated/public mode.

## 5) Reachability verification

From app host:

- `curl -i http://127.0.0.1:5000/api/auth/me`

From another trusted LAN device (only if LAN access is intended):

- `curl -i http://<host_lan_ip>:5000/api/auth/me`

From outside LAN (mobile data or external network):

- Attempt same request and confirm it fails to connect/time out.

## 6) Proxy correctness (if reverse proxy is used)

- Set `TRUST_PROXY=true` only when running behind a trusted reverse proxy.
- Ensure proxy forwards `X-Forwarded-For` correctly.
- Keep proxy itself unexposed unless explicitly required and access-controlled.

## 7) Ongoing operational checks

- Re-run this checklist after:
  - Docker/network config changes
  - Router/firewall changes
  - Enabling/disabling VPN or tunnel tools
- Keep `SESSION_SECRET` strong and unique in production deployments.
