import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { z } from "zod";

const authPayloadSchema = z.object({
  sub: z.string().uuid(),
  username: z.string(),
  normalizedUsername: z.string()
});

export interface AuthTokenPayload {
  sessionId: string;
  username: string;
  normalizedUsername: string;
}

export function signAuthToken(payload: AuthTokenPayload, secret: string, expiresIn: string): string {
  const signOptions: SignOptions = {
    subject: payload.sessionId
  };
  signOptions.expiresIn = expiresIn as NonNullable<SignOptions["expiresIn"]>;

  return jwt.sign(
    {
      username: payload.username,
      normalizedUsername: payload.normalizedUsername
    },
    secret,
    signOptions
  );
}

export function verifyAuthToken(token: string, secret: string): AuthTokenPayload {
  const decoded = jwt.verify(token, secret) as JwtPayload;
  const parsed = authPayloadSchema.parse(decoded);

  return {
    sessionId: parsed.sub,
    username: parsed.username,
    normalizedUsername: parsed.normalizedUsername
  };
}
