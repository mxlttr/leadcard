# Health URLs

- `https://app.leadcard.de/health.json`: uncached JSON; HTTP 503 if the archive cannot be read.
- `https://status.leadcard.de/`: human-readable application, collector, ratings and report status.
- `https://app.leadcard.de/health`: the same human-readable page on the app domain.
- `/api/health`: compatible JSON endpoint for existing checks.

All views use `lib/server/health.ts`. The page is a server-rendered snapshot with
a manual refresh link and Europe/Berlin timestamps. It does not fetch upstream
ratings, generate reports, or claim external services are healthy. Collector
attempt/sweep fields reset at restart; archive poll and snapshot dates persist.

## Host routing

The status hostname uses the existing Cloudflare Tunnel and Leadcard container.
It does not run a second collector or mount a second database.

1. In the **leadcard.de** DNS zone, add a proxied CNAME named `status`, targeting
   `app.leadcard.de` (which already routes through the tunnel).
2. In `/home/max/.cloudflared/config.yml`, before the final catch-all, add:

   ```yaml
   - hostname: status.leadcard.de
     service: http://localhost:80
   ```

   Validate with `cloudflared tunnel ingress validate`, then restart the service
   when applying a changed tunnel configuration. Preserve the other host entries.
3. The proxy's persistent file `/data/coolify/proxy/dynamic/leadcard-status.yaml`
   routes this hostname to the app's existing Docker service and rewrites only
   the root path:

   ```yaml
   http:
     routers:
       leadcard-status:
         entryPoints:
           - http
         rule: Host(`status.leadcard.de`)
         middlewares:
           - leadcard-status-root
         service: http-0-pqxemkkywkcyskl9xrr4k42b@docker
     middlewares:
       leadcard-status-root:
         replacePathRegex:
           regex: "^/$"
           replacement: /health
   ```

   This service name belongs to the current Coolify application and survives its
   normal redeployments. If the application is recreated, inspect its Traefik
   labels and update the reference. TLS terminates at Cloudflare; the tunnel
   carries traffic to the local proxy.

The existing tunnel origin certificate is scoped to **lutter.lol**, not
**leadcard.de**. Do not use its `tunnel route dns` command for this hostname:
Cloudflare can append the certificate's zone and create a record under the wrong
domain. Use credentials scoped to the correct DNS zone or its dashboard.

## Verification

Fetch all three public URLs after deploying. Confirm JSON has `Cache-Control:
no-store`, and the human page contains current report outcomes and formatted
timestamps. Compare the legacy endpoint's shape with `/health.json`; timestamps
can differ when a collector tick happens between requests. Test the proxy route
locally with `curl -H 'Host: status.leadcard.de' http://127.0.0.1/` if DNS is pending.
