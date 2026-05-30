# Task 4 Plan: Fix Filter & Admin Auth Regressions

## 1. Fix `src/common/filters/http-exception.filter.ts`
- Change `response.status(status).send(responseBody)` to `response.type('application/json').status(status).send(responseBody)`.

## 2. Fix `src/auth/guards/auth.guard.ts`
- Add check for `x-master-key` header.
- Compare with `process.env.MASTER_API_KEY` using `crypto.timingSafeEqual`.
- Return `true` if matched.

## 3. Modify `src/admin/admin.controller.ts`
- Add `@Public()` decorator to the class.

## 4. Verification
- Run `npm run build`.
- Run e2e tests.
