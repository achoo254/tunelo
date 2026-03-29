# ngrok Market Analysis & Alternatives Comparison

**Date:** 2026-03-28
**Purpose:** Factual data on ngrok's pricing, limitations, and competitive landscape for Tunelo positioning
**Scope:** Official sources + verified community data

---

## 1. ngrok Pricing & Free Tier Limitations

### Free Tier
- **Cost:** $0 (with $5 one-time usage credit)
- **Online endpoints:** 3 max
- **Bandwidth:** 1GB/month
- **HTTP/S requests:** 20k/month
- **Rate limits:** 4k HTTP requests/min, 100 TCP connections/min
- **Team members:** 1
- **UX penalty:** Interstitial page displayed on HTTP/S endpoints

### Hobbyist Plan ($8-10/month)
- **Cost:** $8/month (annual) or $10/month (monthly)
- **Includes:** $10 monthly usage credit
- **Online endpoints:** 3 max
- **Bandwidth:** 5GB included, then overage charged
- **HTTP/S requests:** 100k/month
- **Rate limits:** 20k HTTP requests/min, 150 TCP connections/min
- **Team members:** 1
- **Key advantage:** No interstitial page

### Pay-as-You-Go Plan ($20+/month)
- **Cost:** $20/month base + overages
- **Includes:** $20 monthly usage credit
- **Online endpoints:** Unlimited
- **Bandwidth:** 5GB included, then $0.10/GB
- **HTTP/S requests:** 100k included, then $1 per 100k
- **Rate limits:** 20k HTTP requests/min, 600 TCP connections/min
- **Team members:** Unlimited (3 included)
- **Features:** Wildcard endpoints, mutual TLS, SSO/RBAC add-ons

### Enterprise
- **Cost:** Custom pricing
- **Target:** Healthcare, finance, government sectors

**Source:** [ngrok Pricing](https://ngrok.com/pricing)

---

## 2. ngrok Architecture & Cloud Dependency

### Cloud Dependency: MANDATORY
- ngrok agent **requires ngrok cloud service** — cannot operate standalone
- Agent connects to `connect.ngrok-agent.com:443` by default
- Creates public endpoints on ngrok infrastructure only
- Routes traffic through ngrok's cloud, not direct tunnels

### Self-Hosting: NOT AVAILABLE
- No self-hosted option for ngrok agent
- Proprietary closed-source (became proprietary ~6+ years ago; was open source v1)
- Alternatives offered: Agent SDKs, Kubernetes Operator, SSH reverse tunnel
- **Key constraint:** If you want Tunelo-style self-hosting, ngrok is eliminated as direct competitor

### Licensing
- Proprietary software
- No source code available for inspection or audit
- No self-hosted edition publicly available

**Source:** [ngrok Agent Docs](https://ngrok.com/docs/agent/)

---

## 3. Performance & Latency

### Observable Metrics
- **Reported latencies:** 56-244ms in real-world SSH use cases (highly variable)
- **Best case:** 10ms latency when connecting to nearest Point of Presence (PoP)
- **Optimization:** Global Load Balancer distributes to nearest healthy PoP based on client latency
- **Connection overhead:** Earlier ngrok versions required 3.5 network round trips for setup; latest versions pre-fetch connections

**Critical gap:** ngrok does NOT publicly publish standard performance benchmarks or overhead metrics. Latency is geography-dependent and not quantified in official docs.

**Source:** [ngrok Global Load Balancer](https://ngrok.com/blog/gslb-global-server-load-balancing)

---

## 4. Alternatives: Feature & Dependency Comparison

### A. Cloudflare Tunnel (cloudflared)

| Aspect | Details |
|--------|---------|
| **Type** | Managed SaaS (Cloudflare-hosted) |
| **Cost** | Free for HTTP/HTTPS tunneling (no bandwidth cap documented) |
| **Open Source** | No, but daemon is lightweight |
| **Self-Hosting** | No — requires Cloudflare's infrastructure |
| **Connection Model** | Outbound-only to Cloudflare edge (firewall-friendly) |
| **Protocols** | HTTP, HTTPS, TCP, UDP via `cloudflared` daemon |
| **Architecture** | 4 long-lived connections to 2 Cloudflare DCs (redundancy built-in) |
| **Rate Limits** | Not explicitly documented; port-based capacity limits exist |
| **Bandwidth** | No documented overages; throughput limited by host port availability |
| **Key UX** | Deep Cloudflare integration (DNS, HTTPS automatic) |
| **Latency** | Not publicly benchmarked |
| **Best For** | Already using Cloudflare; want infrastructure-grade tunnel |

**Verdict:** Direct competitor to ngrok. Free. Cloud-dependent like ngrok. No self-hosting option.

**Sources:** [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/), [Tunnel Capacity](https://developers.cloudflare.com/learning-paths/replace-vpn/connect-private-network/tunnel-capacity/)

---

### B. FRP (Fast Reverse Proxy)

| Aspect | Details |
|--------|---------|
| **Type** | Open source, self-hosted reverse proxy |
| **Cost** | Free (open source) |
| **GitHub** | ~100k+ stars, actively maintained |
| **Protocols** | HTTP, HTTPS, TCP, UDP, KCP (custom protocol) |
| **Architecture** | Deploy `frps` server + `frpc` client agent; direct tunnel model |
| **Features** | Connection pooling, load balancing, bandwidth limiting, stream multiplexing (HTTP/2-style), KCP support |
| **Bandwidth Limiting** | Per-proxy configurable (MB/KB units) |
| **Rate Limits** | Per-proxy rate limiting supported |
| **KCP Optimization** | 30-40% latency reduction, 3x max delay reduction, 10-20% bandwidth overhead |
| **Self-Hosting** | **Yes** — full control, deploy on own VPS |
| **Best For** | Self-hosted alternative; high-throughput low-latency tunnels |

**Verdict:** True self-hosted alternative. No cloud dependency. Production-grade. Tunelo's closest technical competitor.

**Sources:** [FRP GitHub](https://github.com/fatedier/frp), [FRP Docs](https://gofrp.org/en/)

---

### C. Bore (Rust-based TCP Tunneling)

| Aspect | Details |
|--------|---------|
| **Type** | Open source, minimal TCP-only tool |
| **Cost** | Free (open source) |
| **Protocols** | TCP only (no HTTP/HTTPS/UDP) |
| **Architecture** | Lightweight Rust implementation; minimal setup |
| **Use Case** | Very simple TCP port forwarding; dev/testing only |
| **Latency** | Positioned as "extremely lightweight and fast" but no benchmarks |
| **Self-Hosting** | Can self-host, but typically used with public bore server |
| **Best For** | Quick throwaway TCP tunnels; not production |

**Verdict:** Too minimal for most use cases. TCP-only. No comparison to ngrok/FRP feature set.

**Sources:** [ngrok Alternatives Comparison](https://localxpose.io/blog/best-ngrok-alternatives)

---

### D. Localtunnel (npm)

| Aspect | Details |
|--------|---------|
| **Type** | Open source NPM package, managed public servers |
| **Cost** | Free (public servers provided) |
| **Status** | **INACTIVE MAINTENANCE** as of 2026 |
| **Reliability** | Public servers notoriously unreliable, frequent downtime |
| **Protocols** | HTTP/HTTPS only |
| **Last Release** | No updates in 12+ months |
| **Self-Hosting** | `localtunnel-server` abandoned; community forks exist |
| **Best For** | Legacy projects; not recommended for new development |

**Verdict:** Dead project. Public servers unmaintained. Abandoned by maintainers.

**Sources:** [Snyk Advisor - localtunnel](https://snyk.io/advisor/npm-package/localtunnel), [Libraries.io - localtunnel](https://libraries.io/npm/localtunnel)

---

### E. Zrok (OpenZiti-based)

| Aspect | Details |
|--------|---------|
| **Type** | Open source, security-focused, self-hosted capable |
| **Cost** | Free (open source) |
| **Architecture** | Built on OpenZiti zero-trust network |
| **Security** | Enterprise-grade end-to-end encryption |
| **Self-Hosting** | **Yes** — full Ziti control plane |
| **Best For** | High-security requirements, enterprise deployments |

**Verdict:** Suitable for Tunelo comparisons but more complex than FRP. Overkill for simple use cases.

**Sources:** [Awesome Tunneling GitHub](https://github.com/anderspitman/awesome-tunneling)

---

### F. Inlets (self-hosted, Kubernetes-native)

| Aspect | Details |
|--------|---------|
| **Type** | Open source, self-hosted, Kubernetes-native |
| **Cost** | Free (open source) |
| **Architecture** | Exit servers + reverse proxy; Prometheus metrics built-in |
| **Deployment** | Bare-metal, Docker, Kubernetes |
| **Self-Hosting** | **Yes** — exit node required, you manage it |
| **Best For** | Kubernetes environments, metric-intensive setups |

**Verdict:** Good for infrastructure teams; more ops overhead than FRP/Tunelo.

**Sources:** [Awesome Tunneling GitHub](https://github.com/anderspitman/awesome-tunneling)

---

## 5. Market Positioning Summary

### Managed (Cloud-Dependent) Tier
| Tool | Free Tier | Cost Tier | Rate Limits | Bandwidth Cap | Self-Host |
|------|-----------|-----------|-------------|---------------|-----------|
| **ngrok** | 3 endpoints, 1GB, 20k req/mo, 4k req/min | $8-20+/mo | Yes (per-tier) | 1GB→5GB | No |
| **Cloudflare Tunnel** | Unlimited (if using Cloudflare) | Free/bundled | Not documented | No cap documented | No |

### Self-Hosted Tier
| Tool | License | Maturity | Best For | Bandwidth Cap |
|------|---------|----------|----------|---------------|
| **FRP** | Open source | Production-ready (100k+ GH stars) | High-throughput, low-cost ops | Configurable per proxy |
| **Zrok** | Open source | Enterprise-ready | Zero-trust security | Configurable |
| **Inlets** | Open source | Production-ready | Kubernetes/infrastructure | Configurable |
| **Tunelo** | TBD | TBD | Wildcard subdomains, multi-tunnel | TBD |

---

## 6. Key Findings for Tunelo Positioning

### ngrok Weaknesses (Tunelo opportunities)
1. **Cloud dependency:** ngrok cannot be self-hosted — Tunelo's key differentiator
2. **Free tier severely limited:** 1GB bandwidth/month, 3 endpoints max
3. **Vendor lock-in:** Pricing tied to ngrok's cloud usage model
4. **Performance not documented:** No public benchmarks; latency varies by PoP
5. **Closed-source:** No transparency into security or routing logic

### ngrok Strengths (Tunelo must match/exceed)
1. **Ease of use:** One-command `ngrok http 3000` setup
2. **Global PoPs:** Available in multiple regions (latency optimization)
3. **Wildcard TLS:** HTTPS with wildcard domains (if paid)
4. **SDK integration:** Programmatic API for embedded tunneling
5. **Team collaboration:** Multi-user support (paid plans)

### Alternatives Analysis
- **FRP:** Direct technical competitor. Self-hosted, production-ready, but steeper learning curve
- **Cloudflare Tunnel:** Free but requires Cloudflare, outbound-only model (different use case)
- **Localtunnel:** Dead. Not a threat.
- **Bore:** Too minimal. Not serious competition.

---

## 7. Data Gaps & Unresolved Questions

1. **ngrok latency benchmark:** No official standard performance metrics published. Real-world latency claims lack rigor.
2. **Cloudflare Tunnel bandwidth limits:** Free tier bandwidth cap not explicitly documented.
3. **FRP vs ngrok performance:** No direct benchmark comparison available.
4. **ngrok connection limits:** How many simultaneous connections per tier? Not published.
5. **Tunelo requirements:** What's the target scale (5-10k concurrent tunnels mentioned in CLAUDE.md)?
   - Will this impact architecture vs FRP?
6. **Tunelo pricing strategy:** Self-hosted (free) vs managed SaaS tier planned?
7. **Subdomain model:** Tunelo uses wildcard subdomains — what's the namespace collision prevention?

---

## References

- [ngrok Pricing](https://ngrok.com/pricing)
- [ngrok Agent Documentation](https://ngrok.com/docs/agent/)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
- [FRP GitHub Repository](https://github.com/fatedier/frp)
- [Awesome Tunneling (Comprehensive Alternatives List)](https://github.com/anderspitman/awesome-tunneling)
- [ngrok Alternatives 2026 - Pinggy](https://pinggy.io/blog/best_ngrok_alternatives/)
- [Best ngrok Alternatives 2026 - LocalXpose](https://localxpose.io/blog/best-ngrok-alternatives)
- [Tunneling Landscape Medium - InstaTunnel](https://medium.com/@instatunnel/ngrok-alternatives-2026-the-ultimate-tunneling-tool-showdown-9813c8b6b2af)
