import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RbacGuard, Role, ROLE_HIERARCHY, RequireRoles } from './rbac.guard.js';

describe('RbacGuard', () => {
  const handler = jest.fn();
  class TestController {}

  function createContext(user?: { role?: Role }): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('role hierarchy', () => {
    it('should have correct role levels: OWNER > ADMIN > MEMBER', () => {
      expect(ROLE_HIERARCHY[Role.OWNER]).toBe(3);
      expect(ROLE_HIERARCHY[Role.ADMIN]).toBe(2);
      expect(ROLE_HIERARCHY[Role.MEMBER]).toBe(1);
      expect(ROLE_HIERARCHY[Role.OWNER]).toBeGreaterThan(
        ROLE_HIERARCHY[Role.ADMIN],
      );
      expect(ROLE_HIERARCHY[Role.ADMIN]).toBeGreaterThan(
        ROLE_HIERARCHY[Role.MEMBER],
      );
    });
  });

  describe('admin access', () => {
    it('should allow admin to access admin-required route', () => {
      const guard = new RbacGuard(Role.ADMIN);
      expect(guard.canActivate(createContext({ role: Role.ADMIN }))).toBe(true);
    });

    it('should deny admin access to owner-required route', () => {
      const guard = new RbacGuard(Role.OWNER);
      expect(() =>
        guard.canActivate(createContext({ role: Role.ADMIN })),
      ).toThrow(ForbiddenException);
    });

    it('should allow admin to access member-required route', () => {
      const guard = new RbacGuard(Role.MEMBER);
      expect(guard.canActivate(createContext({ role: Role.ADMIN }))).toBe(true);
    });
  });

  describe('member access', () => {
    it('should deny member access to admin-required route', () => {
      const guard = new RbacGuard(Role.ADMIN);
      expect(() =>
        guard.canActivate(createContext({ role: Role.MEMBER })),
      ).toThrow(ForbiddenException);
    });

    it('should deny member access to owner-required route', () => {
      const guard = new RbacGuard(Role.OWNER);
      expect(() =>
        guard.canActivate(createContext({ role: Role.MEMBER })),
      ).toThrow(ForbiddenException);
    });

    it('should allow member to access member-required route', () => {
      const guard = new RbacGuard(Role.MEMBER);
      expect(guard.canActivate(createContext({ role: Role.MEMBER }))).toBe(
        true,
      );
    });
  });

  describe('owner access', () => {
    it('should allow owner to access any route', () => {
      expect(
        new RbacGuard(Role.OWNER).canActivate(
          createContext({ role: Role.OWNER }),
        ),
      ).toBe(true);
      expect(
        new RbacGuard(Role.ADMIN).canActivate(
          createContext({ role: Role.OWNER }),
        ),
      ).toBe(true);
      expect(
        new RbacGuard(Role.MEMBER).canActivate(
          createContext({ role: Role.OWNER }),
        ),
      ).toBe(true);
    });
  });

  describe('no role in token', () => {
    it('should throw ForbiddenException when user role is undefined', () => {
      const guard = new RbacGuard(Role.ADMIN);
      expect(() =>
        guard.canActivate(createContext({ role: undefined })),
      ).toThrow(new ForbiddenException('Role not found in token'));
    });

    it('should throw ForbiddenException when user is undefined', () => {
      const guard = new RbacGuard(Role.ADMIN);
      expect(() => guard.canActivate(createContext(undefined))).toThrow(
        new ForbiddenException('Role not found in token'),
      );
    });

    it('should throw ForbiddenException when request has no user object', () => {
      const guard = new RbacGuard(Role.ADMIN);
      const context = {
        getHandler: () => handler,
        getClass: () => TestController,
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as unknown as ExecutionContext;
      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Role not found in token'),
      );
    });
  });

  describe('unknown role', () => {
    it('should treat unknown role as level 0 and deny access', () => {
      const guard = new RbacGuard(Role.MEMBER);
      const unknownRole = 'unknown' as Role;
      expect(() =>
        guard.canActivate(createContext({ role: unknownRole })),
      ).toThrow(ForbiddenException);
    });
  });

  describe('multiple required roles', () => {
    it('should allow access when user has one of the required roles', () => {
      const guard = new RbacGuard(Role.ADMIN, Role.OWNER);
      expect(guard.canActivate(createContext({ role: Role.ADMIN }))).toBe(true);
      expect(guard.canActivate(createContext({ role: Role.OWNER }))).toBe(true);
    });

    it('should deny access when user has lower role', () => {
      const guard = new RbacGuard(Role.ADMIN, Role.OWNER);
      expect(() =>
        guard.canActivate(createContext({ role: Role.MEMBER })),
      ).toThrow(ForbiddenException);
    });

    it('should throw correct error message with multiple required roles', () => {
      const guard = new RbacGuard(Role.ADMIN, Role.OWNER);
      try {
        guard.canActivate(createContext({ role: Role.MEMBER }));
        fail('Expected ForbiddenException');
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toBe(
          'Access denied. Required role: admin or owner',
        );
      }
    });
  });
});

describe('RequireRoles decorator', () => {
  const handler = jest.fn();
  class TestController {
    @RequireRoles(Role.ADMIN)
    adminMethod() {
      return 'admin';
    }

    @RequireRoles(Role.ADMIN, Role.OWNER)
    multiRoleMethod() {
      return 'multi';
    }

    @RequireRoles(Role.MEMBER)
    memberMethod() {
      return 'member';
    }
  }

  function createContext(user?: { role?: Role }): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access with correct role', () => {
    const controller = new TestController();
    const context = createContext({ role: Role.ADMIN });

    expect(
      (
        controller as unknown as { adminMethod(ctx: ExecutionContext): string }
      ).adminMethod(context),
    ).toBe('admin');
  });

  it('should deny access with insufficient role', () => {
    const controller = new TestController();
    const context = createContext({ role: Role.MEMBER });

    expect(() =>
      (
        controller as unknown as { adminMethod(ctx: ExecutionContext): string }
      ).adminMethod(context),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('should allow access when user has one of multiple allowed roles', () => {
    const controller = new TestController();

    const ctrl = controller as unknown as {
      multiRoleMethod(ctx: ExecutionContext): string;
    };
    expect(ctrl.multiRoleMethod(createContext({ role: Role.ADMIN }))).toBe(
      'multi',
    );
    expect(ctrl.multiRoleMethod(createContext({ role: Role.OWNER }))).toBe(
      'multi',
    );
  });

  it('should deny access when user has none of the multiple allowed roles', () => {
    const controller = new TestController();
    const context = createContext({ role: Role.MEMBER });

    expect(() =>
      (
        controller as unknown as {
          multiRoleMethod(ctx: ExecutionContext): string;
        }
      ).multiRoleMethod(context),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('should throw when no role in token', () => {
    const controller = new TestController();
    const context = createContext(undefined);

    expect(() =>
      (
        controller as unknown as { adminMethod(ctx: ExecutionContext): string }
      ).adminMethod(context),
    ).toThrow(new ForbiddenException('Role not found'));
  });

  it('should allow owner to access member-only method', () => {
    const controller = new TestController();
    const context = createContext({ role: Role.OWNER });

    expect(
      (
        controller as unknown as { memberMethod(ctx: ExecutionContext): string }
      ).memberMethod(context),
    ).toBe('member');
  });

  it('should allow admin to access member-only method', () => {
    const controller = new TestController();
    const context = createContext({ role: Role.ADMIN });

    expect(
      (
        controller as unknown as { memberMethod(ctx: ExecutionContext): string }
      ).memberMethod(context),
    ).toBe('member');
  });
});
