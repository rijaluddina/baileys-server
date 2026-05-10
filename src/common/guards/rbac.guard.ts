import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.OWNER]: 3,
  [Role.ADMIN]: 2,
  [Role.MEMBER]: 1,
};

@Injectable()
export class RbacGuard implements CanActivate {
  private readonly requiredRoles: Role[];

  constructor(...roles: Role[]) {
    this.requiredRoles = roles;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { role?: Role } }>();
    const user = request.user;

    if (!user?.role) {
      throw new ForbiddenException('Role not found in token');
    }

    const userRoleLevel = ROLE_HIERARCHY[user.role] ?? 0;
    const minRequiredLevel = Math.min(
      ...this.requiredRoles.map((r) => ROLE_HIERARCHY[r]),
    );

    if (userRoleLevel < minRequiredLevel) {
      throw new ForbiddenException(
        `Access denied. Required role: ${this.requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}

export function RequireRoles(...roles: Role[]) {
  return (
    _target: object,
    _propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (descriptor) {
      const original = descriptor.value as (...args: unknown[]) => unknown;
      descriptor.value = function (...args: unknown[]) {
        const context = args[0] as ExecutionContext;
        const user = context
          .switchToHttp()
          .getRequest<{ user?: { role?: Role } }>().user;
        if (!user?.role) throw new ForbiddenException('Role not found');
        const userLevel = ROLE_HIERARCHY[user.role] ?? 0;
        const minLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]));
        if (userLevel < minLevel)
          throw new ForbiddenException('Insufficient permissions');

        return original.apply(this, args) as boolean;
      };
    }
  };
}
