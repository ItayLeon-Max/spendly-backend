import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_key";

export type AuthJwtPayload = JwtPayload & {
  userId: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
    }
  }
}

const isAuthJwtPayload = (value: unknown): value is AuthJwtPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.userId === "string" &&
    typeof payload.email === "string"
  );
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  const parts = authorizationHeader.split(" ");
  const token = parts[1];

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized"
    });
  }

  try {
    const decoded: unknown = jwt.verify(token, JWT_SECRET);

    if (!isAuthJwtPayload(decoded)) {
      return res.status(401).json({
        message: "Invalid token payload"
      });
    }

    req.user = decoded;

    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};