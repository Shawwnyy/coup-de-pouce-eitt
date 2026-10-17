/** true dans la version « sans compte » (fichier HTML unique) : tout est gardé dans le navigateur. */
export const LOCAL: boolean = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_LOCAL === '1'
