import { SetMetadata } from '@nestjs/common';

export type Capability =
  | 'messaging'
  | 'groups'
  | 'calls'
  | 'business'
  | 'newsletter'
  | 'presence'
  | 'privacy'
  | 'labels';

export const CAPABILITY_KEY = 'capability';

export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(CAPABILITY_KEY, capabilities);
