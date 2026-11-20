import bcrypt from "bcryptjs";

const ROUNDS = 11;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A valid hash used to keep timing similar when the user does not exist.
export const DUMMY_HASH = "$2b$11$LsaRw1a6PzzjLncPIC5a6ubvJP9K1LA7SJI0.V8qrITFOl0BmJCUm";
