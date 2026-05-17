export type MintedToken = { token: string; expiresAt: number };
export type Minter = (orgId: string, spaceId: string) => Promise<MintedToken>;

export class TokenCache {
  private readonly store = new Map<string, MintedToken>();
  constructor(private readonly mint: Minter, private readonly skewMs = 5_000) {}

  async get(orgId: string, spaceId: string): Promise<string> {
    const key = `${orgId}/${spaceId}`;
    const hit = this.store.get(key);
    if (hit && hit.expiresAt - this.skewMs > Date.now()) return hit.token;
    const fresh = await this.mint(orgId, spaceId);
    this.store.set(key, fresh);
    return fresh.token;
  }
}
