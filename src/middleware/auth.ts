import { Request, Response, NextFunction } from 'express';
import { verifyToken, generateToken } from '../utils';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: any;
      token?: string;
    }
  }
}

// JWT 令牌验证中间件
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    logger.warn('Authentication attempt without token', { 
      ip: req.ip, 
      url: req.url, 
      method: req.method 
    });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NO_TOKEN',
        message: '访问令牌缺失'
      }
    };
    return res.status(401).json(response);
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    req.token = token;
    
    logger.debug('Token verified successfully', { 
      userId: decoded.id, 
      email: decoded.email,
      ip: req.ip 
    });
    
    next();
  } catch (error) {
    logger.warn('Token verification failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      url: req.url,
      method: req.method
    });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: '无效的访问令牌'
      }
    };
    return res.status(403).json(response);
  }
};

// 可选身份验证中间件（不强制要求登录）
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
      req.token = token;
      
      logger.debug('Optional token verified', { 
        userId: decoded.id, 
        email: decoded.email 
      });
    } catch (error) {
      logger.debug('Optional token verification failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // 可选认证失败不阻止请求继续
    }
  }
  
  next();
};

// 角色验证中间件
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NO_USER',
          message: '用户信息缺失'
        }
      };
      return res.status(401).json(response);
    }

    const userRole = req.user.role || req.user.level;
    if (!roles.includes(userRole)) {
      logger.warn('Unauthorized role access attempt', { 
        userId: req.user.id, 
        requiredRoles: roles, 
        userRole,
        ip: req.ip,
        url: req.url 
      });
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: '权限不足'
        }
      };
      return res.status(403).json(response);
    }

    next();
  };
};

// VIP用户验证中间件
export const requireVIP = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NO_USER',
        message: '用户信息缺失'
      }
    };
    return res.status(401).json(response);
  }

  const userLevel = req.user.level || 'regular';
  if (userLevel !== 'vip' && userLevel !== 'premium') {
    logger.warn('VIP access denied', { 
      userId: req.user.id, 
      userLevel,
      ip: req.ip,
      url: req.url 
    });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VIP_REQUIRED',
        message: '此功能需要VIP会员权限'
      }
    };
    return res.status(403).json(response);
  }

  next();
};

// 用户资源所有权验证中间件
export const requireOwnership = (resourceParam: string = 'id') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NO_USER',
          message: '用户信息缺失'
        }
      };
      return res.status(401).json(response);
    }

    const resourceId = req.params[resourceParam];
    const userId = req.user.id;

    if (!resourceId) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NO_RESOURCE_ID',
          message: '资源ID缺失'
        }
      };
      return res.status(400).json(response);
    }

    // 在实际应用中，这里应该查询数据库验证资源所有权
    // 例如：检查订单、生成图像、用户信息等是否属于当前用户
    // 暂时只记录日志，实际验证在具体的控制器中实现
    
    logger.debug('Ownership check initiated', { 
      userId, 
      resourceId, 
      resourceParam,
      ip: req.ip 
    });

    next();
  };
};

// 管理员权限验证中间件
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  return requireRole(['admin', 'superadmin'])(req, res, next);
};

// 超级管理员权限验证中间件
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  return requireRole(['superadmin'])(req, res, next);
};

// 刷新令牌中间件
export const refreshToken = (req: Request, res: Response, next: NextFunction) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NO_REFRESH_TOKEN',
        message: '刷新令牌缺失'
      }
    };
    return res.status(401).json(response);
  }

  try {
    const decoded = verifyToken(refreshToken);
    
    // 生成新的访问令牌
    const newToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      level: decoded.level
    });

    logger.info('Token refreshed successfully', { 
      userId: decoded.id, 
      ip: req.ip 
    });

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: generateToken({
          id: decoded.id,
          email: decoded.email
        }, config.jwt.refreshExpiresIn)
      }
    });
  } catch (error) {
    logger.warn('Token refresh failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip 
    });
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: '无效的刷新令牌'
      }
    };
    return res.status(403).json(response);
  }
};

// 自定义身份验证函数
export const customAuth = (authFn: (req: Request) => Promise<any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authFn(req);
      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: '身份验证失败'
          }
        };
        return res.status(401).json(response);
      }
      
      req.user = user;
      next();
    } catch (error) {
      logger.error('Custom authentication error', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: req.ip 
      });
      
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: '身份验证错误'
        }
      };
      return res.status(500).json(response);
    }
  };
};