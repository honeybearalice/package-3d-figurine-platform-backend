import { Request, Response } from 'express';
import { UserService } from '../services/database';
import { ApiResponse, User } from '../types';
import { hashPassword, verifyPassword, generateToken, generateRefreshToken } from '../utils';
import { logger } from '../utils/logger';
import { validateRequest, ValidationSchemas } from '../middleware/validation';
import { authenticateToken, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { notificationService } from '../services/notification';

// 用户注册
export const register = [
  validateRequest('user', 'register'),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password, phone } = req.body;

    // 检查用户是否已存在
    const existingUser = await UserService.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: '该邮箱已被注册'
        }
      } as ApiResponse);
    }

    // 密码加密
    const hashedPassword = await hashPassword(password);

    // 创建用户
    const user = await UserService.createUser({
      username,
      email,
      password: hashedPassword,
      phone
    });

    // 生成JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      level: user.level
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email
    });

    // 移除敏感信息
    const { password: _, ...userWithoutPassword } = user;

    logger.info('User registered successfully', { 
      userId: user.id, 
      email: user.email,
      username: user.username 
    });

    res.status(201).json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
        refreshToken
      }
    } as ApiResponse);
  })
];

// 用户登录
export const login = [
  validateRequest('user', 'login'),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // 获取用户
    const user = await UserService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '邮箱或密码错误'
        }
      } as ApiResponse);
    }

    // 验证密码
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '邮箱或密码错误'
        }
      } as ApiResponse);
    }

    // 生成JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      username: user.username,
      level: user.level
    });

    const refreshToken = generateRefreshToken({
      id: user.id,
      email: user.email
    });

    // 更新最后登录时间
    await UserService.updateUser(user.id, { 
      // 这里可以添加最后登录时间字段
    });

    // 移除敏感信息
    const { password: _, ...userWithoutPassword } = user;

    logger.info('User logged in successfully', { 
      userId: user.id, 
      email: user.email,
      ip: req.ip 
    });

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
        refreshToken
      }
    } as ApiResponse);
  })
];

// 获取用户信息
export const getProfile = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在'
        }
      } as ApiResponse);
    }

    // 移除敏感信息
    const { password, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword
    } as ApiResponse);
  })
];

// 更新用户信息
export const updateProfile = [
  authenticateToken,
  validateRequest('user', 'update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, email, phone, avatar } = req.body;

    // 检查邮箱是否已被其他用户使用
    if (email) {
      const existingUser = await UserService.getUserByEmail(email);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: '该邮箱已被其他用户使用'
          }
        } as ApiResponse);
      }
    }

    const updatedUser = await UserService.updateUser(req.user.id, {
      username,
      email,
      phone,
      avatar
    });

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在'
        }
      } as ApiResponse);
    }

    // 移除敏感信息
    const { password, ...userWithoutPassword } = updatedUser;

    logger.info('User profile updated', { 
      userId: req.user.id,
      changes: Object.keys(req.body) 
    });

    res.json({
      success: true,
      data: userWithoutPassword
    } as ApiResponse);
  })
];

// 更新用户偏好
export const updatePreferences = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { defaultStyle, preferredSize, favoriteAccessories, notifications } = req.body;

    const updatedPreferences = await UserService.updateUserPreferences(req.user.id, {
      defaultStyle,
      preferredSize,
      favoriteAccessories,
      notifications
    });

    if (!updatedPreferences) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: '用户偏好不存在'
        }
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: updatedPreferences
    } as ApiResponse);
  })
];

// 修改密码
export const changePassword = [
  authenticateToken,
  validateRequest('user', 'changePassword'),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;

    // 获取当前用户
    const user = await UserService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在'
        }
      } as ApiResponse);
    }

    // 验证当前密码
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: '当前密码错误'
        }
      } as ApiResponse);
    }

    // 加密新密码
    const hashedNewPassword = await hashPassword(newPassword);

    // 更新密码
    await UserService.updateUser(user.id, {
      password: hashedNewPassword
    });

    logger.info('User password changed', { 
      userId: user.id,
      ip: req.ip 
    });

    res.json({
      success: true,
      data: {
        message: '密码修改成功'
      }
    } as ApiResponse);
  })
];

// 刷新Token
export const refreshToken = [
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_REFRESH_TOKEN',
          message: '刷新令牌缺失'
        }
      } as ApiResponse);
    }

    try {
      const decoded = verifyToken(refreshToken);
      
      // 生成新的访问令牌
      const user = await UserService.getUserById(decoded.id);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: '用户不存在'
          }
        } as ApiResponse);
      }

      const newToken = generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
        level: user.level
      });

      const newRefreshToken = generateRefreshToken({
        id: user.id,
        email: user.email
      });

      res.json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken
        }
      } as ApiResponse);
    } catch (error) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: '无效的刷新令牌'
        }
      } as ApiResponse);
    }
  })
];

// 获取用户列表（管理员）
export const getUsers = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, search, level } = req.query;

    const result = await UserService.getUsers({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string,
      level: level as string
    });

    res.json({
      success: true,
      data: result.users,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 删除用户（管理员）
export const deleteUser = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // 不能删除自己
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CANNOT_DELETE_SELF',
          message: '不能删除自己的账户'
        }
      } as ApiResponse);
    }

    const user = await UserService.deleteUser(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在'
        }
      } as ApiResponse);
    }

    logger.info('User deleted by admin', { 
      userId: id,
      adminId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: '用户删除成功'
      }
    } as ApiResponse);
  })
];

// 用户登出
export const logout = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('User logged out', { 
      userId: req.user.id,
      ip: req.ip 
    });

    res.json({
      success: true,
      data: {
        message: '登出成功'
      }
    } as ApiResponse);
  })
];

// 获取用户统计信息
export const getUserStats = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { UserService, OrderService, ImageService } = require('../services/database');
    
    // 获取用户相关统计
    const [generatedImages, orders] = await Promise.all([
      ImageService.getUserGeneratedImages(req.user.id, { page: 1, limit: 1 }),
      OrderService.getOrders({ userId: req.user.id, page: 1, limit: 1 })
    ]);

    const stats = {
      totalGeneratedImages: generatedImages.pagination.total,
      totalOrders: orders.pagination.total,
      totalSpent: 0, // 需要从订单计算
      memberSince: new Date(req.user.createdAt).toLocaleDateString('zh-CN'),
      level: req.user.level
    };

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  })
];

// 检查用户名是否可用
export const checkUsername = [
  asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.query;

    if (!username) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_USERNAME',
          message: '用户名参数缺失'
        }
      } as ApiResponse);
    }

    const users = await UserService.getUsers({ 
      page: 1, 
      limit: 1, 
      search: username as string 
    });

    const isAvailable = users.pagination.total === 0;

    res.json({
      success: true,
      data: {
        username,
        available: isAvailable
      }
    } as ApiResponse);
  })
];

// 检查邮箱是否可用
export const checkEmail = [
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_EMAIL',
          message: '邮箱参数缺失'
        }
      } as ApiResponse);
    }

    const existingUser = await UserService.getUserByEmail(email as string);
    const isAvailable = !existingUser;

    res.json({
      success: true,
      data: {
        email,
        available: isAvailable
      }
    } as ApiResponse);
  })
];

// 导出控制器函数
export default {
  register,
  login,
  getProfile,
  updateProfile,
  updatePreferences,
  changePassword,
  refreshToken,
  getUsers,
  deleteUser,
  logout,
  getUserStats,
  checkUsername,
  checkEmail
};