# Research: Open-Source ngrok Alternatives & Tunnel Proxy Architectures
**Date:** 2026-03-28 | **Time:** 13:50

---

## 1. Top Open-Source Alternatives Comparison

| Project | Language | GitHub Stars | Architecture Pattern | Pros | Cons |
|---------|----------|--------------|---------------------|------|------|
| **frp** | Go | ~160k | Reverse proxy + multiplexing | Feature-rich, HTTP/HTTPS/TCP/UDP/WebSocket support, stable | Larger binary, higher resource usage |
| **rathole** | Rust | ~5,000 | Reverse proxy + Noise Protocol | Low resource (~500KB), high performance, stable under load, optional TLS/Noise encryption | Fewer features than frp |
| **tunnelmole** | TypeScript/Node.js | 1.6k+ | WebSocket + persistent relay | Native Node.js integration, simple, self-hostable, open source | WebSocket-dependent, potential bottleneck at scale |
| **localtunnel** | Node.js | 30k+ | TCP tunneling + reverse proxy | Simple, lightweight, easy deployment | Limited features, minimal introspection |
| **bore** | Rust | 1.5k+ | Minimal TCP tunnel | Ultra-lightweight, easy to deploy, minimal dependencies | No HTTP inspection, basic TCP only |
| **expose** | Go | Unknown | Go-based reverse proxy | Lightweight alternative | Limited documentation |
| **zrok** | Go | 3.7k+ | OpenZiti zero-trust overlay | Zero-trust security, E2E encryption, private + public sharing | Heavier than simple tunnels, OpenZiti dependency |
| **pgrok** | Go | 3.4k+ | SSH remote port forwarding + HTTP/TCP | Multi-tenant capable, integrates with Caddy for HTTPS | SSH dependency complexity |
| **jprq** | Python (server: Go) | 93 | WebSocket relay | Simple setup | Unmaintained, low adoption |

**Key Insight:** frp dominates in features/popularity; rathole wins on performance/resources; tunnelmole ideal for Node.js ecosystem.

---

## 2. Protocol Handling Comparison

### TLS Termination
- **frp:** Native HTTPS with custom certificates or Let's Encrypt integration
- **rathole:** Optional Noise Protocol (modern TLS alternative); TLS support available; no custom cert overhead
- **tunnelmole:** Relies on reverse proxy (nginx/caddy) for TLS termination; client handles HTTPS transparently
- **localtunnel/bore:** Server typically handles TLS; client tunnels raw traffic
- **zrok:** End-to-end encryption built into OpenZiti layer; TLS optional at HTTP level

### Wildcard Subdomain Routing
- **frp:** Supports hostname-based routing with nginx/caddy; no native wildcard DNS support
- **rathole:** Works with nginx for hostname routing; must route behind reverse proxy
- **tunnelmole:** Uses subdomain routing (tunnel.tunnelmole.com + random prefix); can configure custom domain
- **localtunnel:** Similar subdomain pattern (localtunnel.me + random prefix)
- **pgrok:** SSH tunnel + Caddy can route *.domain.com with configuration

**Pattern:** Most tunnels delegate wildcard routing to reverse proxy layer (nginx/caddy), not built-in.

### WebSocket Tunneling
- **frp:** Native WebSocket support in config; multiplexes WebSocket over HTTP/HTTPS
- **tunnelmole:** Core architecture is WebSocket-based; optimal for WebSocket clients
- **rathole:** TCP-based; WebSocket must be layered on top (less efficient)
- **localtunnel/bore:** HTTP/TCP only; no native WebSocket optimization
- **zrok:** Supports TCP tunnels which can carry WebSocket traffic

**Insight:** WebSocket works best in tunnelmole/frp; others require HTTP layer wrapping.

### Connection Multiplexing
- **frp:** Multiplexing on single TCP connection (head-of-line blocking possible)
- **rathole:** Single TCP connection with minimal overhead; optimized for performance
- **tunnelmole:** WebSocket multiplexing; handles multiple requests in single connection
- **QUIC-based (reverst):** UDP-based, no head-of-line blocking, connection migration support
- **HTTP/2:** Better than TCP but head-of-line blocking at TCP layer remains
- **HTTP/3 (QUIC):** Superior multiplexing; 90% improvement over HTTP/2 under packet loss

**Recommendation:** For high-concurrency scenarios, QUIC (reverst) > HTTP/2 > TCP-based.

---

## 3. Node.js/TypeScript Tunnel Implementations

### Existing Solutions
1. **tunnelmole** (TypeScript, full-stack)
   - Client: npm package, TypeScript
   - Server: TypeScript, self-hostable
   - Architecture: Persistent WebSocket relay
   - Performance: Good for <1000 concurrent users; WebSocket overhead grows at scale

2. **localtunnel** (Node.js)
   - Architecture: TCP reverse proxy
   - npm package available
   - Minimal implementation (~200 lines possible)

3. **http-proxy-middleware** (Express/Node.js utility)
   - Not a standalone tunnel, but used in many Node.js tunnel projects
   - Handles HTTP proxying, WebSocket upgrade
   - Popular in custom implementations

### Performance Considerations for Network Proxying
- **Bottleneck:** Tunnels are I/O-bound, not CPU-bound; Node.js uses single-threaded event loop
- **Worker Threads:** For >10k concurrent connections, consider worker threads or Rust rewrite
- **WebSocket overhead:** ~2-4 bytes frame overhead per message; acceptable for <100 Mbps
- **Memory per connection:** ~50-100 KB per active connection; 1000 connections = 50-100 MB
- **Reverse proxy pairing:** Pair Node.js tunnel with C10k-capable proxy (nginx, caddy, or HAProxy)
  - Node.js handles tunneling logic; nginx handles connection multiplexing

**Honest take:** Node.js is viable for <10k connections; rathole (Rust) for >50k connections.

---

## 4. Architecture Patterns for Building Tunnel Proxy

### Pattern 1: Reverse Proxy + WebSocket Relay (tunnelmole approach)
```
Client -> WebSocket (persistent) -> Server -> HTTP request to local service
Response: Local service -> Server -> WebSocket -> Client
```
**Pros:** Bidirectional, persistent connection, simple logic
**Cons:** WebSocket overhead, single connection per client (no parallelism)
**Best for:** Development, <1000 concurrent clients, HTTP/HTTPS only

### Pattern 2: Reverse Proxy + TCP Multiplexing (frp/rathole approach)
```
Client -> Mux layer (manages multiple TCP streams) -> Server -> routes to local service
```
**Pros:** High throughput, efficient multiplexing, works with any TCP protocol
**Cons:** More complex protocol design, need mux state management
**Best for:** Production, >10k concurrent clients, mixed TCP/UDP/HTTP

### Pattern 3: SSH Tunneling (pgrok approach)
```
Client -> SSH remote port forwarding -> Server -> Local service
```
**Pros:** Uses SSH, no custom authentication needed, easy to implement
**Cons:** SSH overhead, slower setup, auth complexity scales poorly
**Best for:** Lightweight deployments, trusted networks, low concurrency

### Pattern 4: QUIC + HTTP/3 (reverst approach)
```
Client -> QUIC (streams) -> Server -> Local service
```
**Pros:** Connection migration, no head-of-line blocking, 0-RTT resumption
**Cons:** Newer protocol, requires QUIC support, less mature tooling
**Best for:** High-latency networks, mobile (network changes), streaming

### Recommended: Hybrid Approach
- **Tunnel core:** Rust-based (rathole) for performance
- **HTTP layer:** nginx/caddy reverse proxy for TLS + routing
- **WebSocket support:** Separate WebSocket relay service
- **Monitoring:** Prometheus metrics, health checks

---

## 5. Wildcard SSL with Let's Encrypt

### Setup Process
1. **DNS Prerequisites:**
   - Wildcard DNS record: `*.tunnel.domain.com` → server IP (A/CNAME record)
   - Verify DNS before requesting cert

2. **Certificate Generation (DNS-01 Challenge):**
   ```bash
   certbot certonly --dns-<provider> \
     -d tunnel.domain.com \
     -d *.tunnel.domain.com \
     --preferred-challenges dns
   ```
   - Requires DNS API access (Cloudflare, Route53, DigitalOcean, etc.)
   - Certbot inserts `_acme-challenge.tunnel.domain.com` TXT record

3. **Automation:**
   - Let's Encrypt certs expire in 90 days
   - Set renewal at 60 days using cron: `certbot renew --quiet`
   - For DNS-01: Use provider-specific hook scripts

4. **Server Configuration:**
   - Install cert at: `/etc/letsencrypt/live/tunnel.domain.com/`
   - Configure nginx/caddy to serve all subdomains: `server_name ~^(.+)\.tunnel\.domain\.com$;`
   - Redirect HTTP to HTTPS automatically

### Cost
- **Let's Encrypt:** Free
- **DNS API access:** Usually free (Cloudflare, Route53 free tier)
- **Total setup cost:** ~$0 (plus domain)

**Key constraint:** DNS-01 challenge required for wildcard; HTTP-01 insufficient.

---

## 6. Minimum Infrastructure for Self-Hosted Tunnel Server

### Compute Requirements (by expected concurrency)

| Concurrency | CPU | RAM | Disk | Estimated Cost (VPS) |
|------------|-----|-----|------|----------------------|
| **<1,000** | 1 core | 512 MB | 10 GB | $2-5/mo |
| **1k-10k** | 2 cores | 2-4 GB | 20 GB | $5-15/mo |
| **10k-100k** | 4 cores | 8 GB | 50 GB | $20-50/mo |
| **>100k** | 8 cores | 16+ GB | 100+ GB | $100+/mo |

### Reference: rathole footprint
- Idle: <10 MB RAM, <1% CPU
- 10k connections: ~500 MB RAM, 5-10% CPU (2-core)
- Binary: 500 KB

### Reference: Cloudflare Tunnel (heavy baseline)
- Minimum: 4 GB RAM, 4 CPU cores
- Supports: 8,000 clients per host
- Port limit: 50,000 ports configured

### Recommended Minimal Setup ($5-15/mo)
1. **Single VPS:** Ubuntu 20.04, 2 vCPU, 4 GB RAM
2. **Reverse proxy:** nginx (in VPS)
3. **Tunnel server:** rathole or frp (single instance)
4. **SSL/TLS:** Let's Encrypt wildcard cert (free, auto-renew)
5. **DNS:** Wildcard A record → VPS IP
6. **Monitoring:** Netdata or Prometheus (optional)

### Do Not Need (YAGNI)
- Load balancer (until >50k concurrent)
- Database (tunnel metadata can stay in-memory or flatfile)
- Kubernetes (overkill for tunnel)
- CDN (tunnel is real-time, not cacheable)

### Scaling Path
- **Phase 1 (MVP):** Single VPS, rathole + nginx, 5k concurrent
- **Phase 2:** Add second tunnel server, nginx as L7 LB, 20k concurrent
- **Phase 3:** Scale horizontally with state sync (Redis), 100k+ concurrent

---

## Key Findings Summary

1. **Best overall:** frp (features) + rathole (performance)
2. **Best for Node.js teams:** tunnelmole (TypeScript end-to-end)
3. **Best for minimal setup:** bore or expose (Rust, <1 MB)
4. **Best for zero-trust:** zrok (OpenZiti foundation)
5. **Best protocol:** QUIC (reverst) for modern networks; HTTP/2 as compromise
6. **Architecture recommendation:** Rust core + nginx proxy + WebSocket relay
7. **Self-hosting cost:** $5-15/mo for 1k-10k concurrent connections
8. **Wildcard SSL:** DNS-01 challenge required; automate renewal

---

## Unresolved Questions

1. **Does rathole support native HTTP introspection?** (hostname routing without nginx)
2. **Performance comparison:** tunnelmole vs frp under 100k concurrent WebSocket clients?
3. **QUIC adoption:** How many tunnel tools support QUIC natively vs tunneling QUIC traffic?
4. **State persistence:** Do any tunnel solutions store connection metadata for analytics?
5. **Horizontal scaling:** How do frp/rathole handle multi-server setups with shared state?

---

## Sources
- [GitHub - anderspitman/awesome-tunneling](https://github.com/anderspitman/awesome-tunneling)
- [Best ngrok Alternatives for 2026](https://localxpose.io/blog/best-ngrok-alternatives)
- [Medium - Open-Source Ngrok Alternatives](https://medium.com/@instatunnel/the-best-open-source-ngrok-alternatives-an-overview-and-comparison-of-solutions-like-localtunnel-zrok-and-tunnelmole)
- [FRP vs. Rathole vs. ngrok Comparison](https://xtom.com/blog/frp-rathole-ngrok-comparison-best-reverse-tunneling-solution/)
- [Tunnelmole: The Open Source ngrok Alternative](https://dev.to/robbiecahill/tunnelmole-the-open-source-ngrok-alternative-developers-need-4a0c)
- [GitHub - wstunnel (WebSocket/HTTP2 tunneling)](https://github.com/erebe/wstunnel)
- [Reverst: Reverse Tunnels with QUIC](https://github.com/flipt-io/reverst)
- [Building HTTP Tunnel with WebSocket and Node.js](https://medium.com/@embbnux/building-a-http-tunnel-with-websocket-and-node-js-98068b0225d3)
- [HTTP/2 vs HTTP/3 Performance Comparison](https://arxiv.org/html/2409.16267v1)
- [How to Create Let's Encrypt Wildcard Certificates](https://www.digitalocean.com/community/tutorials/how-to-create-let-s-encrypt-wildcard-certificates-with-certbot)
- [Cloudflare Tunnel Hosting Requirements](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/do-more-with-tunnels/hosting-requirements)
- [GitHub - pgrok](https://github.com/pgrok/pgrok)
- [GitHub - zrok (OpenZiti)](https://github.com/openziti/zrok)
- [GitHub - tunnelmole-client](https://github.com/robbie-cahill/tunnelmole-client)
- [GitHub - localtunnel](https://github.com/localtunnel/localtunnel)
- [I Built a Localhost Tunneling tool in TypeScript](https://dev.to/robbiecahill/i-built-a-localhost-tunneling-tool-in-typescript-heres-what-surprised-me-17eg)
