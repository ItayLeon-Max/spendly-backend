import type { Request, Response } from "express";
import streamifier from "streamifier";
import { prisma } from "../config/prisma.js";
import { cloudinary } from "../config/cloudinary.js";

type UploadResult = {
  secure_url: string;
};

type BudgetAllocationInput = {
  category: string;
  amount: number;
};

const allowedBudgetCategories = [
  "food",
  "transport",
  "shopping",
  "bills",
  "entertainment",
  "health"
] as const;

// ===============================
// GET CURRENT USER
// ===============================
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
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

// ===============================
// UPDATE MONTHLY BUDGET (ישן נשאר)
// ===============================
export const updateMonthlyBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
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
        id: userId
      },
      data: {
        monthlyBudget: parsedBudget
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
      }
    });

    return res.status(200).json(updatedUser);
  } catch {
    return res.status(500).json({
      message: "Server error while updating monthly budget"
    });
  }
};

// ===============================
// NEW: SMART BUDGET SETUP
// ===============================
export const setupSmartBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const { monthlyIncome, managedBudget } = req.body;

    const income = Number(monthlyIncome);
    const budget = Number(managedBudget);

    if (Number.isNaN(income) || income <= 0) {
      return res.status(400).json({
        message: "Invalid monthly income"
      });
    }

    if (Number.isNaN(budget) || budget <= 0) {
      return res.status(400).json({
        message: "Invalid managed budget"
      });
    }

    const allocations = [
      { category: "food", percent: 0.25 },
      { category: "transport", percent: 0.10 },
      { category: "shopping", percent: 0.15 },
      { category: "bills", percent: 0.25 },
      { category: "entertainment", percent: 0.15 },
      { category: "health", percent: 0.10 }
    ];

    const computedAllocations = allocations.map((allocation) => ({
      category: allocation.category,
      amount: Math.round(budget * allocation.percent)
    }));

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: userId
        },
        data: {
          monthlyIncome: income,
          managedBudget: budget,
          monthlyBudget: budget
        }
      }),
      prisma.budgetAllocation.deleteMany({
        where: {
          userId
        }
      }),
      prisma.budgetAllocation.createMany({
        data: computedAllocations.map((allocation) => ({
          userId,
          category: allocation.category,
          amount: allocation.amount
        }))
      })
    ]);

    const updatedUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
      }
    });

    return res.status(200).json({
      message: "Smart budget created successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while creating smart budget"
    });
  }
};

// ===============================
// NEW: UPDATE BUDGET ALLOCATIONS
// ===============================
export const updateBudgetAllocations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const { allocations } = req.body as {
      allocations?: BudgetAllocationInput[];
    };

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        message: "allocations must be a non-empty array"
      });
    }

    const sanitizedAllocations = allocations.map((allocation) => ({
      category:
        typeof allocation.category === "string"
          ? allocation.category.trim().toLowerCase()
          : "",
      amount: Number(allocation.amount)
    }));

    const hasInvalidCategory = sanitizedAllocations.some(
      (allocation) =>
        !allowedBudgetCategories.includes(
          allocation.category as (typeof allowedBudgetCategories)[number]
        )
    );

    if (hasInvalidCategory) {
      return res.status(400).json({
        message: "One or more categories are invalid"
      });
    }

    const hasInvalidAmount = sanitizedAllocations.some(
      (allocation) => Number.isNaN(allocation.amount) || allocation.amount < 0
    );

    if (hasInvalidAmount) {
      return res.status(400).json({
        message: "All allocation amounts must be valid non-negative numbers"
      });
    }

    const totalManagedBudget = sanitizedAllocations.reduce(
      (sum, allocation) => sum + allocation.amount,
      0
    );

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: userId
        },
        data: {
          managedBudget: totalManagedBudget,
          monthlyBudget: totalManagedBudget
        }
      }),
      prisma.budgetAllocation.deleteMany({
        where: {
          userId
        }
      }),
      prisma.budgetAllocation.createMany({
        data: sanitizedAllocations.map((allocation) => ({
          userId,
          category: allocation.category,
          amount: allocation.amount
        }))
      })
    ]);

    const updatedUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
      }
    });

    return res.status(200).json({
      message: "Budget allocations updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while updating budget allocations"
    });
  }
};

// ===============================
// UPLOAD PROFILE IMAGE
// ===============================
export const uploadProfileImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
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
        id: userId
      },
      select: {
        profileImage: true
      }
    });

    const uploadResult: UploadResult = await new Promise<UploadResult>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "spendly/profile-images",
          resource_type: "image",
          public_id: `user_${userId}_${Date.now()}`
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
        id: userId
      },
      data: {
        profileImage: uploadResult.secure_url
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
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

// ===============================
// REMOVE PROFILE IMAGE
// ===============================
export const removeProfileImage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId
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
        id: userId
      },
      data: {
        profileImage: null
      },
      include: {
        budgetAllocations: {
          orderBy: {
            category: "asc"
          }
        }
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