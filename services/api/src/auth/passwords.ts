import { hash, verify } from '@node-rs/argon2';

/** Argon2id with the OWASP-recommended minimum: 19 MiB memory, 2 iterations, 1 lane. */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When the user doesn't exist, a dummy hash is checked anyway so the
 * response time doesn't reveal which emails are registered.
 */
export async function verifyPassword(passwordHash: string | null, password: string) {
  if (!passwordHash) {
    dummyHash ??= hashPassword('smartfin-timing-equaliser');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}
