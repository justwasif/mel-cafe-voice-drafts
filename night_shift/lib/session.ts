import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE_NAME = "mb_session";
const secret = new TextEncoder().encode(env.SESSION_SECRET);

export type Session = { authenticated: true } | { authenticated: false };

export async function signIn(password: string): Promise<boolean> {
  if (password !== env.APP_PASSWORD) return false;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return true;
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { authenticated: false };
  try {
    await jwtVerify(token, secret, { algorithms: ["HS256"] });
    return { authenticated: true };
  } catch {
    return { authenticated: false };
  }
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session.authenticated) {
    throw new Error("Unauthorized");
  }
  return session;
}
