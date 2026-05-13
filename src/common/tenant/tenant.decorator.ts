import { SetMetadata } from '@nestjs/common';
import { TenantContextStore } from './tenant-context.store';

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
      if (!tenant) {
        throw new Error('Tenant context not set');
      }
      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}