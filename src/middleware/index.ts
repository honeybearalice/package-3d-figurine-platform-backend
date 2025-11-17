// 身份验证中间件
export * from './auth';

// 验证中间件
export * from './validation';

// 限流中间件
export * from './rateLimit';

// 文件上传中间件
export * from './upload';

// 错误处理中间件
export * from './error';

// 通用中间件
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getClientIP } from '../utils';

// CORS 中间件
export const cors = (req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
};

// 安全头中间件
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  next();
};

// 请求日志中间件
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const ip = getClientIP(req);
  
  logger.info('Request started', {
    method: req.method,
    url: req.url,
    ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip,
      userId: req.user?.id
    });
  });
  
  next();
};

// 请求ID中间件
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);
  
  req.requestId = requestId as string;
  res.setHeader('X-Request-ID', requestId as string);
  
  next();
};

// 压缩中间件
export const compression = require('compression')();

// 缓存控制中间件
export const cacheControl = (options: {
  maxAge?: number;
  public?: boolean;
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
} = {}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (options.noCache) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (options.noStore) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (options.private) {
      res.setHeader('Cache-Control', `private, max-age=${options.maxAge || 0}`);
    } else if (options.public) {
      res.setHeader('Cache-Control', `public, max-age=${options.maxAge || 300}`);
    }
    
    next();
  };
};

// 内容类型中间件
export const contentType = (type: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Type', type);
    next();
  };
};

// 响应时间中间件
export const responseTime = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    res.setHeader('X-Response-Time', `${responseTime}ms`);
  });
  
  next();
};

// 请求大小限制中间件
export const requestSizeLimit = (limit: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['content-length'] && parseInt(req.headers['content-length'] as string) > parseInt(limit) * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: '请求数据过大'
        }
      });
    }
    
    next();
  };
};

// 清理查询参数中间件
export const cleanQuery = (req: Request, res: Response, next: NextFunction) => {
  // 移除空值
  Object.keys(req.query).forEach(key => {
    if (req.query[key] === '' || req.query[key] === null || req.query[key] === undefined) {
      delete req.query[key];
    }
  });
  
  // 清理特殊字符
  Object.keys(req.query).forEach(key => {
    if (typeof req.query[key] === 'string') {
      req.query[key] = req.query[key]!.toString().trim();
    }
  });
  
  next();
};

// API 版本中间件
export const apiVersion = (version: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    req.apiVersion = version;
    next();
  };
};

// 用户代理解析中间件
export const userAgentParser = (req: Request, res: Response, next: NextFunction) => {
  const userAgent = req.get('User-Agent');
  
  if (userAgent) {
    req.userAgent = {
      browser: /Chrome/i.test(userAgent) ? 'Chrome' :
               /Firefox/i.test(userAgent) ? 'Firefox' :
               /Safari/i.test(userAgent) ? 'Safari' :
               /Edge/i.test(userAgent) ? 'Edge' : 'Other',
      os: /Windows/i.test(userAgent) ? 'Windows' :
          /Mac/i.test(userAgent) ? 'macOS' :
          /Linux/i.test(userAgent) ? 'Linux' :
          /Android/i.test(userAgent) ? 'Android' :
          /iOS/i.test(userAgent) ? 'iOS' : 'Other',
      device: /Mobile/i.test(userAgent) ? 'Mobile' : 'Desktop',
      original: userAgent
    };
  }
  
  next();
};

// 分页处理中间件
export const pagination = (options: {
  defaultLimit?: number;
  maxLimit?: number;
  defaultPage?: number;
} = {}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const defaultLimit = options.defaultLimit || 20;
    const maxLimit = options.maxLimit || 100;
    const defaultPage = options.defaultPage || 1;
    
    let limit = parseInt(req.query.limit as string) || defaultLimit;
    let page = parseInt(req.query.page as string) || defaultPage;
    
    // 限制参数范围
    limit = Math.min(Math.max(limit, 1), maxLimit);
    page = Math.max(page, 1);
    
    req.pagination = {
      limit,
      page,
      offset: (page - 1) * limit
    };
    
    next();
  };
};

// 请求频率监控中间件
export const requestMonitor = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    
    // 记录慢请求
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        status,
        userId: req.user?.id,
        ip: req.ip
      });
    }
    
    // 记录错误请求
    if (status >= 400) {
      logger.warn('Error request', {
        method: req.method,
        url: req.url,
        status,
        duration: `${duration}ms`,
        userId: req.user?.id,
        ip: req.ip
      });
    }
  });
  
  next();
};

// 开发环境中间件
export const developmentOnly = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    next();
  } else {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '此功能仅在开发环境中可用'
      }
    });
  }
};

// 生产环境中间件
export const productionOnly = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    next();
  } else {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '此功能仅在生产环境中可用'
      }
    });
  }
};