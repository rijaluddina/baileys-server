import { TenantContextStore } from './tenant-context.store';
import { TenantContextError } from './tenant-context.error';

export const TENANT_KEY = 'tenant';

export function Tenant(): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const tenant = TenantContextStore.get();
      if (!tenant || !tenant.tenantId) {
        throw new TenantContextError('Tenant context not set');
      }
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}
