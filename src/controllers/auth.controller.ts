import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_spendly_key";

const createToken = (user: { id: string; email: string }) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
};

export const register = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({
        message: "fullName, email and password are required"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already in use"
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        monthlyBudget: true,
        profileImage: true
      }
    });

    const token = createToken({
      id: user.id,
      email: user.email
    });

    return res.status(201).json({
      token,
      user
    });
  } catch {
    return res.status(500).json({
      message: "Server error while registering user"
    });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (!existingUser) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const isPasswordValid = await bcrypt.compare(password, existingUser.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = createToken({
      id: existingUser.id,
      email: existingUser.email
    });

    return res.status(200).json({
      token,
      user: {
        id: existingUser.id,
        fullName: existingUser.fullName,
        email: existingUser.email,
        monthlyBudget: existingUser.monthlyBudget,
        profileImage: existingUser.profileImage
      }
    });
  } catch {
    return res.status(500).json({
      message: "Server error while logging in"
    });
  }
};