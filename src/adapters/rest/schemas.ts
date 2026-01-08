import { z } from "zod";

// Session schemas
export const createSessionSchema = z.object({
    sessionId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    name: z.string().optional(),
});

export const sessionIdParamSchema = z.object({
    id: z.string().min(1),
});

// Message schemas
export const sendTextMessageSchema = z.object({
    sessionId: z.string().min(1),
    to: z.string().min(1),
    text: z.string().min(1),
    quotedMessageId: z.string().optional(),
});

export const sendMediaMessageSchema = z.object({
    sessionId: z.string().min(1),
    to: z.string().min(1),
    type: z.enum(["image", "video", "audio", "document"]),
    mediaUrl: z.string().url().optional(),
    mediaBase64: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
    mimetype: z.string().optional(),
});

export const deleteMessageSchema = z.object({
    sessionId: z.string().min(1),
    jid: z.string().min(1),
    messageId: z.string().min(1),
    fromMe: z.boolean().optional(),
});

// Contact schemas
export const jidParamSchema = z.object({
    jid: z.string().min(1),
});

export const contactActionSchema = z.object({
    sessionId: z.string().min(1),
});

// Group schemas
export const createGroupSchema = z.object({
    sessionId: z.string().min(1),
    subject: z.string().min(1).max(100),
    participants: z.array(z.string().min(1)).min(1),
});

export const updateGroupSchema = z.object({
    sessionId: z.string().min(1),
    subject: z.string().optional(),
    description: z.string().optional(),
});

export const groupParticipantsSchema = z.object({
    sessionId: z.string().min(1),
    action: z.enum(["add", "remove", "promote", "demote"]),
    participants: z.array(z.string().min(1)).min(1),
});

// Presence schemas
export const updatePresenceSchema = z.object({
    sessionId: z.string().min(1),
    presence: z.enum(["available", "unavailable"]),
});

export const subscribePresenceSchema = z.object({
    sessionId: z.string().min(1),
});

// Type exports
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type SendMediaMessageInput = z.infer<typeof sendMediaMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type GroupParticipantsInput = z.infer<typeof groupParticipantsSchema>;
export type UpdatePresenceInput = z.infer<typeof updatePresenceSchema>;
