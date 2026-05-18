import { TenantContextStore } from './tenant-context.store';
import { TenantContextError } from './tenant-context.error';

export const TENANT_KEY = 'tenant';

type TenantAwareMethod = (this: object, ...args: unknown[]) => unknown;

export function Tenant(): MethodDecorator {
  return function <T>(
    _target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (typeof originalMethod !== 'function') {
      throw new TypeError(
        `@Tenant() can only be applied to methods: ${String(propertyKey)}`,
      );
    }

    descriptor.value = function (this: object, ...args: unknown[]) {
      const tenant = TenantContextStore.get();
      if (!tenant || !tenant.tenantId) {
        throw new TenantContextError('Tenant context not set');
      }
      return Reflect.apply(originalMethod as TenantAwareMethod, this, args);
    } as T;
    return descriptor;
  };
}
