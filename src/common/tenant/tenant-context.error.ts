export class TenantContextError extends Error {
  constructor(message = 'Tenant context not set') {
    super(message);
    this.name = 'TenantContextError';
  }
}
