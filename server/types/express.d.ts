import "express-session";

declare module "express-session" {
  interface SessionData {
    passport?: { user: number };
    lastActivity?: number; // timestamp for inactivity timeout
  }
}
