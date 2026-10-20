type Socket = { requestIP(request: Request): { address: string } | null }

/**
 * The caller's address, for rate limits. Behind a Cloudflare Tunnel every connection comes from cloudflared on this machine, so the socket
 * address is always the same; the real one is in CF-Connecting-IP. That header is believed only when TRUST_CLOUDFLARE=true, i.e. when nothing
 * but cloudflared can reach the server (otherwise anybody could send it and dodge the limits).
 */
export function clientIp(request: Request, server?: Socket | null) {
  if (process.env.TRUST_CLOUDFLARE === 'true') {
    const ip = request.headers.get('cf-connecting-ip')?.trim()
    if (ip) return ip
  }
  return server?.requestIP(request)?.address
}
