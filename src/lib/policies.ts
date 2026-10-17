import { LIMITS } from './config.ts'
import type { FilePolicy } from './files.ts'

export const CHAT_POLICY: FilePolicy = {
  allow: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
  maxBytes: { image: LIMITS.imageBytes, gif: LIMITS.gifBytes, video: LIMITS.videoBytes },
}

export const HELP_IMAGE_POLICY: FilePolicy = {
  allow: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxBytes: { image: LIMITS.imageBytes, gif: LIMITS.gifBytes, video: 0 },
}

export const AVATAR_POLICY: FilePolicy = {
  allow: ['image/png', 'image/jpeg', 'image/webp'],
  maxBytes: { image: LIMITS.avatarBytes, gif: 0, video: 0 },
}
