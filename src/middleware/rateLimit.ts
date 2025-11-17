import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

// 基础限流中间件
export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}) => {
  return rateLimit({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: options.max || config.rateLimit.max,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: options.message || '请求过于频繁，请稍后再试'
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req) => {
      return req.ip || 'unknown';
    }),
    skip: options.skip || (() => false),
    onLimitReached: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      
      if (options.onLimitReached) {
        options.onLimitReached(req, res);
      }
    }
  });
};

// 全局限流（基于IP）
export const generalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每15分钟最多100个请求
  message: '请求过于频繁，请稍后再试'
});

// 严格限流（防止垃圾请求）
export const strictRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10个请求
  message: '请求过于频繁，请稍后再试'
});

// 宽松限流（用于搜索等）
export const relaxedRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 200, // 每15分钟最多200个请求
  message: '请求过于频繁，请稍后再试'
});

// 认证相关限流
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 15分钟内最多5次认证尝试
  message: '登录尝试过于频繁，请15分钟后再试',
  onLimitReached: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email,
      url: req.url,
      method: req.method
    });
  }
});

// 图像生成限流
export const imageGenerationRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每小时最多10次生成
  message: '图像生成次数已达上限，请稍后再试',
  keyGenerator: (req) => {
    return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
});

// 支付相关限流
export const paymentRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 3, // 15分钟内最多3次支付尝试
  message: '支付尝试过于频繁，请稍后再试',
  keyGenerator: (req) => {
    return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
});

// 文件上传限流
export const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 20, // 每小时最多20次上传
  message: '文件上传次数已达上限，请稍后再试',
  keyGenerator: (req) => {
    return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
});

// 搜索限流
export const searchRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次搜索
  message: '搜索请求过于频繁，请稍后再试'
});

// API调用限流（基于用户角色）
export const createUserRoleRateLimit = (roles: { [key: string]: { windowMs: number; max: number } }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.level || req.user?.role || 'anonymous';
    const limits = roles[userRole] || roles['anonymous'];

    const limiter = createRateLimiter({
      windowMs: limits.windowMs,
      max: limits.max,
      message: `${userRole}用户请求过于频繁，请稍后再试`,
      keyGenerator: (req) => {
        return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
      }
    });

    return limiter(req, res, next);
  };
};

// 默认角色限流配置
export const roleBasedRateLimit = createUserRoleRateLimit({
  anonymous: { windowMs: 15 * 60 * 1000, max: 50 },
  regular: { windowMs: 15 * 60 * 1000, max: 100 },
  vip: { windowMs: 15 * 60 * 1000, max: 200 },
  premium: { windowMs: 15 * 60 * 1000, max: 500 },
  admin: { windowMs: 15 * 60 * 1000, max: 1000 }
});

// 动态限流（基于业务指标）
export const createDynamicRateLimit = (getLimits: (req: Request) => { windowMs: number; max: number }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const limits = getLimits(req);
    const limiter = createRateLimiter(limits);
    return limiter(req, res, next);
  };
};

// 固定窗口限流
export const createFixedWindowRateLimit = (windowMs: number, max: number) => {
  return createRateLimiter({
    windowMs,
    max,
    message: '请求过于频繁，请稍后再试'
  });
};

// 滑动窗口限流
export const createSlidingWindowRateLimit = (windowMs: number, max: number) => {
  return createRateLimiter({
    windowMs,
    max,
    message: '请求过于频繁，请稍后再试'
  });
};

// 自定义限流（带条件）
export const createConditionalRateLimit = (
  condition: (req: Request) => boolean,
  limits: { windowMs: number; max: number },
  defaultLimits: { windowMs: number; max: number }
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const appliedLimits = condition(req) ? limits : defaultLimits;
    const limiter = createRateLimiter(appliedLimits);
    return limiter(req, res, next);
  };
};

// IP白名单限流
export const createWhitelistRateLimit = (whitelist: string[], limits: { windowMs: number; max: number }) => {
  return createRateLimiter({
    ...limits,
    skip: (req) => whitelist.includes(req.ip || ''),
    message: '请求过于频繁，请稍后再试'
  });
};

// IP黑名单限流
export const createBlacklistRateLimit = (blacklist: string[], limits: { windowMs: number; max: number }) => {
  return createRateLimiter({
    ...limits,
    skip: (req) => !blacklist.includes(req.ip || ''),
    message: '您的IP地址已被限制访问'
  });
};

// 健康检查专用限流
export const healthCheckRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 每分钟最多60次健康检查
  message: '健康检查请求过于频繁'
});

// Webhook专用限流
export const webhookRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30个webhook
  keyGenerator: (req) => {
    // 使用webhook secret作为key
    return req.headers['x-webhook-secret'] || `ip:${req.ip}`;
  }
});

// 媒体文件访问限流
export const mediaAccessRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次媒体访问
  keyGenerator: (req) => {
    return req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
  }
});

// 导出所有限流中间件
export const rateLimiters = {
  general: generalRateLimit,
  strict: strictRateLimit,
  relaxed: relaxedRateLimit,
  auth: authRateLimit,
  imageGeneration: imageGenerationRateLimit,
  payment: paymentRateLimit,
  upload: uploadRateLimit,
  search: searchRateLimit,
  roleBased: roleBasedRateLimit,
  healthCheck: healthCheckRateLimit,
  webhook: webhookRateLimit,
  mediaAccess: mediaAccessRateLimit
};

export default rateLimiters;