import type { Request, Response } from "express";
import streamifier from "streamifier";
import { prisma } from "../config/prisma.js";
import { cloudinary } from "../config/cloudinary.js";
import { PushService } from "../services/push.service.js";

type UploadResult = {
  secure_url: string;
};

type BudgetAllocationInput = {
  category: string;
  amount: number;
};

type UpdatePushSettingsInput = {
  pushToken?: string | null;
  pushNotificationsEnabled?: boolean;
  preferredLanguage?: "english" | "hebrew";
};

type CreateSharedBudgetInput = {
  name?: string;
};

type InviteToSharedBudgetInput = {
  email?: string;
};

type CreateSharedBudgetExpenseInput = {
  title?: string;
  amount?: number;
  category?: string;
  mood?: "happy" | "stressed" | "spontaneous" | "tired" | "treatingMyself" | null;
  isNeed?: boolean;
};

type SharedBudgetExpenseSummary = {
  totalSpent: number;
  expenseCount: number;
  remainingBudget: number;
  isOverBudget: boolean;
};

const allowedBudgetCategories = [
  "food",
  "transport",
  "shopping",
  "bills",
  "entertainment",
  "health"
] as const;

const FREE_SHARED_BUDGET_MAX_PEOPLE = 3;

const allowedExpenseMoods = [
  "happy",
  "stressed",
  "spontaneous",
  "tired",
  "treatingMyself"
] as const;

const getSharedBudgetMembership = async (sharedBudgetId: string, userId: string) => {
  return prisma.sharedBudgetMember.findUnique({
    where: {
      sharedBudgetId_userId: {
        sharedBudgetId,
        userId
      }
    }
  });
};

const calculateSharedBudgetExpenseSummary = (
  expenses: Array<{ amount: number }>,
  monthlyBudget: number
): SharedBudgetExpenseSummary => {
  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const expenseCount = expenses.length;
  const remainingBudget = monthlyBudget - totalSpent;
  const isOverBudget = remainingBudget < 0;

  return {
    totalSpent,
    expenseCount,
    remainingBudget,
    isOverBudget
  };
};

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

    console.log("FILE:", file);
    console.log("BUFFER SIZE:", file.buffer?.length);

    const result = await cloudinary.uploader.upload(
      `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
      {
        folder: "spendly/profile-images",
        resource_type: "image",
        public_id: `user_${userId}_${Date.now()}`
      }
    );

    const uploadResult: UploadResult = {
      secure_url: result.secure_url
    };

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
    console.error("UPLOAD ERROR >>>", error);

    return res.status(500).json({
      message: "Server error while uploading profile image",
      error: error instanceof Error ? error.message : error
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

// ===============================
// UPDATE PUSH SETTINGS (DEVICE TOKEN + PREFERENCES)
// ===============================
export const updatePushSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const { pushToken, pushNotificationsEnabled, preferredLanguage } =
      req.body as UpdatePushSettingsInput;

    const updateData: any = {};

    if (pushToken !== undefined) {
      if (pushToken !== null && typeof pushToken !== "string") {
        return res.status(400).json({ message: "Invalid pushToken" });
      }
      updateData.pushToken = pushToken;
    }

    if (pushNotificationsEnabled !== undefined) {
      if (typeof pushNotificationsEnabled !== "boolean") {
        return res.status(400).json({ message: "Invalid pushNotificationsEnabled" });
      }
      updateData.pushNotificationsEnabled = pushNotificationsEnabled;
    }

    if (preferredLanguage !== undefined) {
      if (preferredLanguage !== "english" && preferredLanguage !== "hebrew") {
        return res.status(400).json({ message: "Invalid preferredLanguage" });
      }
      updateData.preferredLanguage = preferredLanguage;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        budgetAllocations: {
          orderBy: { category: "asc" }
        }
      }
    });

    return res.status(200).json({
      message: "Push settings updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error while updating push settings"
    });
  }
};

// ===============================
// SAVE PUSH TOKEN (SIMPLE ENDPOINT FOR iOS)
// ===============================
export const savePushToken = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { pushToken } = req.body;

    if (!userId || !pushToken) {
      return res.status(400).json({ message: "Missing data" });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        pushToken,
        pushNotificationsEnabled: true
      }
    });

    return res.status(200).json({ message: "Push token saved" });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// CREATE SHARED BUDGET
// ===============================
export const createSharedBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const { name } = req.body as CreateSharedBudgetInput;
    const trimmedName = typeof name === "string" ? name.trim() : "";

    if (!trimmedName) {
      return res.status(400).json({
        message: "Shared budget name is required"
      });
    }

    const sharedBudget = await prisma.sharedBudget.create({
      data: {
        name: trimmedName,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: "owner"
          }
        }
      },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        invites: {
          where: {
            status: "pending"
          },
          include: {
            invitedUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            },
            invitedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    return res.status(201).json({
      message: "Shared budget created successfully",
      sharedBudget
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while creating shared budget"
    });
  }
};

// ===============================
// INVITE USER TO SHARED BUDGET
// ===============================
export const inviteUserToSharedBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sharedBudgetId = req.params.sharedBudgetId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!sharedBudgetId || typeof sharedBudgetId !== "string") {
      return res.status(400).json({
        message: "Invalid sharedBudgetId"
      });
    }

    const { email } = req.body as InviteToSharedBudgetInput;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return res.status(400).json({
        message: "Invite email is required"
      });
    }

    const sharedBudget = await prisma.sharedBudget.findFirst({
      where: {
        id: sharedBudgetId,
        ownerId: userId
      },
      include: {
        members: true,
        invites: {
          where: {
            status: "pending"
          }
        }
      }
    });

    if (!sharedBudget) {
      return res.status(404).json({
        message: "Shared budget not found"
      });
    }

    const invitedUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        profileImage: true,
        preferredLanguage: true
      }
    });

    if (!invitedUser) {
      return res.status(404).json({
        message: "User with this email was not found"
      });
    }

    if (invitedUser.id === userId) {
      return res.status(400).json({
        message: "You cannot invite yourself"
      });
    }

    const isAlreadyMember = sharedBudget.members.some((member) => member.userId === invitedUser.id);

    if (isAlreadyMember) {
      return res.status(400).json({
        message: "This user is already part of the shared budget"
      });
    }

    const hasPendingInvite = sharedBudget.invites.some(
      (invite) => invite.invitedUserId === invitedUser.id
    );

    if (hasPendingInvite) {
      return res.status(400).json({
        message: "This user already has a pending invitation"
      });
    }

    const currentPeopleCount = sharedBudget.members.length + sharedBudget.invites.length;

    if (currentPeopleCount >= FREE_SHARED_BUDGET_MAX_PEOPLE) {
      return res.status(400).json({
        message: "Free shared budgets are limited to 3 people"
      });
    }

    const invite = await prisma.sharedBudgetInvite.create({
      data: {
        sharedBudgetId,
        invitedByUserId: userId,
        invitedUserId: invitedUser.id,
        status: "pending"
      },
      include: {
        invitedUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        },
        invitedByUser: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        sharedBudget: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    await PushService.sendToUser(invitedUser.id, {
      title:
        invitedUser.preferredLanguage === "hebrew"
          ? "הזמנה לתקציב משותף"
          : "Shared Budget Invitation",
      body:
        invitedUser.preferredLanguage === "hebrew"
          ? `קיבלת הזמנה להצטרף ל־${sharedBudget.name}`
          : `You received an invitation to join ${sharedBudget.name}`,
      data: {
        type: "shared_budget_invite",
        sharedBudgetId,
        inviteId: invite.id
      }
    });

    return res.status(201).json({
      message: "Invitation sent successfully",
      invite
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while inviting user to shared budget"
    });
  }
};

// ===============================
// GET MY SHARED BUDGET INVITES
// ===============================
export const getMySharedBudgetInvites = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const invites = await prisma.sharedBudgetInvite.findMany({
      where: {
        invitedUserId: userId,
        status: "pending"
      },
      include: {
        sharedBudget: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true
          }
        },
        invitedByUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.status(200).json({
      invites
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while fetching shared budget invites"
    });
  }
};

// ===============================
// ACCEPT SHARED BUDGET INVITE
// ===============================
export const acceptSharedBudgetInvite = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const inviteId = req.params.inviteId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!inviteId || typeof inviteId !== "string") {
      return res.status(400).json({
        message: "Invalid inviteId"
      });
    }

    const invite = await prisma.sharedBudgetInvite.findFirst({
      where: {
        id: inviteId,
        invitedUserId: userId
      },
      include: {
        invitedByUser: {
          select: {
            id: true,
            fullName: true,
            preferredLanguage: true
          }
        },
        sharedBudget: {
          include: {
            members: true,
            invites: {
              where: {
                status: "pending"
              }
            }
          }
        }
      }
    });

    if (!invite) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({
        message: "This invitation has already been handled"
      });
    }

    const existingMembership = await prisma.sharedBudgetMember.findUnique({
      where: {
        sharedBudgetId_userId: {
          sharedBudgetId: invite.sharedBudgetId,
          userId
        }
      }
    });

    if (existingMembership) {
      await prisma.sharedBudgetInvite.update({
        where: {
          id: inviteId
        },
        data: {
          status: "accepted",
          respondedAt: new Date()
        }
      });

      return res.status(200).json({
        message: "Invitation accepted successfully"
      });
    }

    const activePeopleCount = invite.sharedBudget.members.length + invite.sharedBudget.invites.length;

    if (activePeopleCount > FREE_SHARED_BUDGET_MAX_PEOPLE) {
      return res.status(400).json({
        message: "This shared budget has reached the free limit of 3 people"
      });
    }

    await prisma.$transaction([
      prisma.sharedBudgetInvite.update({
        where: {
          id: inviteId
        },
        data: {
          status: "accepted",
          respondedAt: new Date()
        }
      }),
      prisma.sharedBudgetMember.create({
        data: {
          sharedBudgetId: invite.sharedBudgetId,
          userId,
          role: "member"
        }
      })
    ]);

    const acceptingUser = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        fullName: true
      }
    });

    await PushService.sendToUser(invite.invitedByUser.id, {
      title:
        invite.invitedByUser.preferredLanguage === "hebrew"
          ? "ההזמנה אושרה"
          : "Invitation Accepted",
      body:
        invite.invitedByUser.preferredLanguage === "hebrew"
          ? `${acceptingUser?.fullName ?? "משתמש"} אישר את ההזמנה לתקציב המשותף`
          : `${acceptingUser?.fullName ?? "A user"} accepted your shared budget invitation`,
      data: {
        type: "shared_budget_invite_accepted",
        sharedBudgetId: invite.sharedBudgetId
      }
    });

    return res.status(200).json({
      message: "Invitation accepted successfully"
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while accepting shared budget invite"
    });
  }
};

// ===============================
// DECLINE SHARED BUDGET INVITE
// ===============================
export const declineSharedBudgetInvite = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const inviteId = req.params.inviteId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!inviteId || typeof inviteId !== "string") {
      return res.status(400).json({
        message: "Invalid inviteId"
      });
    }

    const invite = await prisma.sharedBudgetInvite.findFirst({
      where: {
        id: inviteId,
        invitedUserId: userId
      }
    });

    if (!invite) {
      return res.status(404).json({
        message: "Invitation not found"
      });
    }

    if (invite.status !== "pending") {
      return res.status(400).json({
        message: "This invitation has already been handled"
      });
    }

    await prisma.sharedBudgetInvite.update({
      where: {
        id: inviteId
      },
      data: {
        status: "declined",
        respondedAt: new Date()
      }
    });

    return res.status(200).json({
      message: "Invitation declined successfully"
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while declining shared budget invite"
    });
  }
};

// ===============================
// GET MY SHARED BUDGETS
// ===============================
export const getMySharedBudgets = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const sharedBudgets = await prisma.sharedBudget.findMany({
      where: {
        members: {
          some: {
            userId
          }
        }
      },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        invites: {
          where: {
            status: "pending"
          },
          include: {
            invitedUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.status(200).json({
      sharedBudgets
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while fetching shared budgets"
    });
  }
};

// ===============================
// GET SHARED BUDGET DETAIL
// ===============================
export const getSharedBudgetDetail = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sharedBudgetId = req.params.sharedBudgetId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!sharedBudgetId || typeof sharedBudgetId !== "string") {
      return res.status(400).json({
        message: "Invalid sharedBudgetId"
      });
    }

    const membership = await getSharedBudgetMembership(sharedBudgetId, userId);

    if (!membership) {
      return res.status(403).json({
        message: "You are not a member of this shared budget"
      });
    }

    const sharedBudget = await prisma.sharedBudget.findUnique({
      where: {
        id: sharedBudgetId
      },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true,
            monthlyBudget: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: {
            createdAt: "asc"
          }
        },
        invites: {
          where: {
            status: "pending"
          },
          include: {
            invitedUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            },
            invitedByUser: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          }
        },
        expenses: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImage: true
              }
            }
          },
          orderBy: [
            {
              date: "desc"
            },
            {
              createdAt: "desc"
            }
          ]
        }
      }
    });

    if (!sharedBudget) {
      return res.status(404).json({
        message: "Shared budget not found"
      });
    }

    const sharedBudgetMonthlyBudget = sharedBudget.owner?.monthlyBudget ?? 0;
    const summary = calculateSharedBudgetExpenseSummary(
      sharedBudget.expenses,
      sharedBudgetMonthlyBudget
    );

    return res.status(200).json({
      sharedBudget,
      summary,
      monthlyBudget: sharedBudgetMonthlyBudget
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while fetching shared budget detail"
    });
  }
};

// ===============================
// GET SHARED BUDGET EXPENSES
// ===============================
export const getSharedBudgetExpenses = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sharedBudgetId = req.params.sharedBudgetId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!sharedBudgetId || typeof sharedBudgetId !== "string") {
      return res.status(400).json({
        message: "Invalid sharedBudgetId"
      });
    }

    const membership = await getSharedBudgetMembership(sharedBudgetId, userId);

    if (!membership) {
      return res.status(403).json({
        message: "You are not a member of this shared budget"
      });
    }

    const expenses = await prisma.expense.findMany({
      where: {
        sharedBudgetId
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        }
      },
      orderBy: [
        {
          date: "desc"
        },
        {
          createdAt: "desc"
        }
      ]
    });

    const sharedBudget = await prisma.sharedBudget.findUnique({
      where: {
        id: sharedBudgetId
      },
      include: {
        owner: {
          select: {
            monthlyBudget: true
          }
        }
      }
    });

    const monthlyBudget = sharedBudget?.owner?.monthlyBudget ?? 0;
    const summary = calculateSharedBudgetExpenseSummary(expenses, monthlyBudget);

    return res.status(200).json({
      expenses,
      summary,
      monthlyBudget
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while fetching shared budget expenses"
    });
  }
};

// ===============================
// ADD SHARED BUDGET EXPENSE
// ===============================
export const addSharedBudgetExpense = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sharedBudgetId = req.params.sharedBudgetId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!sharedBudgetId || typeof sharedBudgetId !== "string") {
      return res.status(400).json({
        message: "Invalid sharedBudgetId"
      });
    }

    const membership = await getSharedBudgetMembership(sharedBudgetId, userId);

    if (!membership) {
      return res.status(403).json({
        message: "You are not a member of this shared budget"
      });
    }

    const { title, amount, category, mood, isNeed } = req.body as CreateSharedBudgetExpenseInput;

    const normalizedTitle = typeof title === "string" ? title.trim() : "";
    const parsedAmount = Number(amount);
    const normalizedCategory = typeof category === "string" ? category.trim().toLowerCase() : "";

    if (!normalizedTitle) {
      return res.status(400).json({
        message: "Expense title is required"
      });
    }

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        message: "Expense amount must be a valid positive number"
      });
    }

    if (
      !allowedBudgetCategories.includes(
        normalizedCategory as (typeof allowedBudgetCategories)[number]
      )
    ) {
      return res.status(400).json({
        message: "Expense category is invalid"
      });
    }

    if (
      mood !== undefined &&
      mood !== null &&
      !allowedExpenseMoods.includes(mood)
    ) {
      return res.status(400).json({
        message: "Expense mood is invalid"
      });
    }

    if (isNeed !== undefined && typeof isNeed !== "boolean") {
      return res.status(400).json({
        message: "Expense isNeed must be a boolean"
      });
    }

    const createdExpense = await prisma.expense.create({
      data: {
        title: normalizedTitle,
        amount: parsedAmount,
        category: normalizedCategory,
        mood: mood ?? null,
        isNeed: isNeed ?? true,
        userId,
        sharedBudgetId
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImage: true
          }
        }
      }
    });

    const expenses = await prisma.expense.findMany({
      where: {
        sharedBudgetId
      },
      select: {
        amount: true
      }
    });

    const sharedBudget = await prisma.sharedBudget.findUnique({
      where: {
        id: sharedBudgetId
      },
      include: {
        owner: {
          select: {
            monthlyBudget: true
          }
        }
      }
    });

    const monthlyBudget = sharedBudget?.owner?.monthlyBudget ?? 0;
    const summary = calculateSharedBudgetExpenseSummary(expenses, monthlyBudget);

    return res.status(201).json({
      message: "Shared budget expense created successfully",
      expense: createdExpense,
      summary,
      monthlyBudget
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while creating shared budget expense"
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

// ===============================
// DELETE SHARED BUDGET
// ===============================
export const deleteSharedBudget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const sharedBudgetId = req.params.sharedBudgetId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    if (!sharedBudgetId || typeof sharedBudgetId !== "string") {
      return res.status(400).json({
        message: "Invalid sharedBudgetId"
      });
    }

    const sharedBudget = await prisma.sharedBudget.findFirst({
      where: {
        id: sharedBudgetId,
        ownerId: userId
      },
      select: {
        id: true
      }
    });

    if (!sharedBudget) {
      return res.status(404).json({
        message: "Shared budget not found or you are not the owner"
      });
    }

    await prisma.sharedBudget.delete({
      where: {
        id: sharedBudgetId
      }
    });

    return res.status(200).json({
      message: "Shared budget deleted successfully"
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error while deleting shared budget"
    });
  }
};