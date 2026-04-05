import type { Request, Response } from "express";
import streamifier from "streamifier";
import { prisma } from "../config/prisma.js";
import { cloudinary } from "../config/cloudinary.js";

export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        monthlyBudget: true,
        profileImage: true
      }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.status(200).json(user);
  } catch {
    return res.status(500).json({
      message: "Server error while fetching current user"
    });
  }
};

export const updateMonthlyBudget = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const { monthlyBudget } = req.body;
    const parsedBudget = Number(monthlyBudget);

    if (Number.isNaN(parsedBudget) || parsedBudget < 0) {
      return res.status(400).json({
        message: "monthlyBudget must be a valid non-negative number"
      });
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: req.user.userId
      },
      data: {
        monthlyBudget: parsedBudget
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        monthlyBudget: true,
        profileImage: true
      }
    });

    return res.status(200).json(updatedUser);
  } catch {
    return res.status(500).json({
      message: "Server error while updating monthly budget"
    });
  }
};

export const uploadProfileImage = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "No image uploaded"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: req.user.userId
      },
      select: {
        profileImage: true
      }
    });

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "spendly/profile-images",
          resource_type: "image",
          public_id: `user_${req.user!.userId}_${Date.now()}`
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }

          resolve({
            secure_url: result.secure_url
          });
        }
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    const existingProfileImage = existingUser?.profileImage;

    if (typeof existingProfileImage === "string" && existingProfileImage.length > 0) {
      const publicId = extractCloudinaryPublicId(existingProfileImage);

      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: "image"
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: req.user.userId
      },
      data: {
        profileImage: uploadResult.secure_url
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        monthlyBudget: true,
        profileImage: true
      }
    });

    return res.status(200).json({
      message: "Profile image uploaded successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while uploading profile image"
    });
  }
};

export const removeProfileImage = async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: req.user.userId
      },
      select: {
        profileImage: true
      }
    });

    const existingProfileImage = existingUser?.profileImage;

    if (typeof existingProfileImage === "string" && existingProfileImage.length > 0) {
      const publicId = extractCloudinaryPublicId(existingProfileImage);

      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: "image"
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: {
        id: req.user.userId
      },
      data: {
        profileImage: null
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        monthlyBudget: true,
        profileImage: true
      }
    });

    return res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while removing profile image"
    });
  }
};

const extractCloudinaryPublicId = (imageUrl: string): string | null => {
  const marker = "/upload/";
  const markerIndex = imageUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const afterUpload = imageUrl.substring(markerIndex + marker.length);
  const parts = afterUpload.split("/");

  if (parts.length === 0) {
    return null;
  }

  const versionPattern = /^v\d+$/;

  if (versionPattern.test(parts[0] ?? "")) {
    parts.shift();
  }

  const pathWithoutExtension = parts.join("/").replace(/\.[^/.]+$/, "");

  return pathWithoutExtension || null;
};