export enum Capability {
  SEND_MESSAGE = 'send_message',
  RECEIVE_MESSAGE = 'receive_message',
  SEND_MEDIA = 'send_media',
  CREATE_GROUP = 'create_group',
  MANAGE_GROUP = 'manage_group',
  MANAGE_CONTACTS = 'manage_contacts',
  MAKE_CALL = 'make_call',
  RECEIVE_CALL = 'receive_call',
  VIEW_CHATS = 'view_chats',
  MANAGE_WEBHOOKS = 'manage_webhooks',
}

export enum SessionType {
  STANDARD = 'standard',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

export interface CapabilityGroup {
  name: string;
  capabilities: Capability[];
}

export const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    name: 'messaging',
    capabilities: [
      Capability.SEND_MESSAGE,
      Capability.RECEIVE_MESSAGE,
      Capability.SEND_MEDIA,
    ],
  },
  {
    name: 'groups',
    capabilities: [Capability.CREATE_GROUP, Capability.MANAGE_GROUP],
  },
  {
    name: 'contacts',
    capabilities: [Capability.MANAGE_CONTACTS],
  },
  {
    name: 'calls',
    capabilities: [Capability.MAKE_CALL, Capability.RECEIVE_CALL],
  },
  {
    name: 'chats',
    capabilities: [Capability.VIEW_CHATS],
  },
  {
    name: 'webhooks',
    capabilities: [Capability.MANAGE_WEBHOOKS],
  },
];

export const DEFAULT_CAPABILITIES_PER_SESSION_TYPE: Record<
  SessionType,
  Capability[]
> = {
  [SessionType.STANDARD]: [
    Capability.SEND_MESSAGE,
    Capability.RECEIVE_MESSAGE,
    Capability.SEND_MEDIA,
    Capability.VIEW_CHATS,
  ],
  [SessionType.PREMIUM]: [
    Capability.SEND_MESSAGE,
    Capability.RECEIVE_MESSAGE,
    Capability.SEND_MEDIA,
    Capability.CREATE_GROUP,
    Capability.MANAGE_GROUP,
    Capability.MANAGE_CONTACTS,
    Capability.VIEW_CHATS,
  ],
  [SessionType.ENTERPRISE]: [
    Capability.SEND_MESSAGE,
    Capability.RECEIVE_MESSAGE,
    Capability.SEND_MEDIA,
    Capability.CREATE_GROUP,
    Capability.MANAGE_GROUP,
    Capability.MANAGE_CONTACTS,
    Capability.MAKE_CALL,
    Capability.RECEIVE_CALL,
    Capability.VIEW_CHATS,
    Capability.MANAGE_WEBHOOKS,
  ],
};
