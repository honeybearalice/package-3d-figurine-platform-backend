import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

// 扩展 Error 类型
declare global {
  namespace Express {
    interface Error {
      status?: number;
      statusCode?: number;
      isOperational?: boolean;
      code?: string;
      details?: any;
    }
  }
}

// 自定义错误类
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code: string;
  public readonly details?: any;

  constructor(
    message: string, 
    statusCode: number = 500, 
    code: string = 'APP_ERROR',
    isOperational: boolean = true,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 预定义错误
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = '身份验证失败') {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = '权限不足') {
    super(message, 403, 'AUTHORIZATION_ERROR', true);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '资源未找到') {
    super(message, 404, 'NOT_FOUND', true);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = '资源冲突') {
    super(message, 409, 'CONFLICT_ERROR', true);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = '请求过于频繁') {
    super(message, 429, 'RATE_LIMIT_ERROR', true);
  }
}

export class UploadError extends AppError {
  constructor(message: string = '文件上传失败') {
    super(message, 422, 'UPLOAD_ERROR', true);
  }
}

export class PaymentError extends AppError {
  constructor(message: string = '支付处理失败') {
    super(message, 402, 'PAYMENT_ERROR', true);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string = '外部服务错误') {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', true, { service });
  }
}

// 错误处理中间件
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = '服务器内部错误';
  let details: any = undefined;

  // 记录错误
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user?.id
  });

  // 处理不同类型的错误
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error.name === 'ValidationError') {
    // Joi 验证错误
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = '请求参数验证失败';
    details = error.message;
  } else if (error.name === 'CastError') {
    // Mongoose Cast 错误
    statusCode = 400;
    code = 'INVALID_ID';
    message = '无效的ID格式';
  } else if (error.name === 'MongoError' && (error as any).code === 11000) {
    // MongoDB 重复键错误
    statusCode = 409;
    code = 'DUPLICATE_ERROR';
    message = '数据已存在';
  } else if (error.name === 'JsonWebTokenError') {
    // JWT 错误
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = '无效的访问令牌';
  } else if (error.name === 'TokenExpiredError') {
    // JWT 过期错误
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = '访问令牌已过期';
  } else if (error.name === 'MulterError') {
    // Multer 文件上传错误
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    message = error.message;
  } else if (error.message?.includes('ENOENT')) {
    // 文件不存在错误
    statusCode = 404;
    code = 'FILE_NOT_FOUND';
    message = '文件不存在';
  } else if (error.message?.includes('EACCES')) {
    // 权限错误
    statusCode = 403;
    code = 'PERMISSION_DENIED';
    message = '权限被拒绝';
  }

  // 在生产环境下不暴露内部错误信息
  if (config.nodeEnv === 'production' && statusCode === 500) {
    message = '服务器内部错误';
  }

  // 构建错误响应
  const errorResponse: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details })
    }
  };

  // 在开发环境下添加调试信息
  if (config.nodeEnv === 'development') {
    (errorResponse.error as any).stack = error.stack;
    (errorResponse.error as any).timestamp = new Date().toISOString();
  }

  res.status(statusCode).json(errorResponse);
};

// 404 错误处理
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new NotFoundError(`路径 ${req.originalUrl} 未找到`);
  next(error);
};

// 异步错误处理包装器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 验证错误格式化
export const formatValidationErrors = (errors: any[]): Array<{ field: string; message: string }> => {
  return errors.map(error => ({
    field: error.path || error.param || 'unknown',
    message: error.message || error.msg || '验证失败'
  }));
};

// 数据库错误处理
export const handleDatabaseError = (error: any): AppError => {
  if (error.code === 11000) {
    // 重复键错误
    const field = Object.keys(error.keyValue)[0];
    return new ConflictError(`${field} 已存在`);
  }
  
  if (error.name === 'CastError') {
    return new ValidationError('无效的数据格式');
  }
  
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map((err: any) => ({
      field: err.path,
      message: err.message
    }));
    return new ValidationError('数据验证失败', errors);
  }
  
  return new AppError('数据库操作失败', 500, 'DATABASE_ERROR');
};

// AWS 错误处理
export const handleAWSError = (error: any): AppError => {
  if (error.code === 'NoSuchKey') {
    return new NotFoundError('文件不存在');
  }
  
  if (error.code === 'AccessDenied') {
    return new AuthorizationError('文件访问被拒绝');
  }
  
  if (error.code === 'EntityTooLarge') {
    return new UploadError('文件大小超出限制');
  }
  
  return new ExternalServiceError('AWS', 'AWS 服务错误');
};

// 支付错误处理
export const handlePaymentError = (error: any): AppError => {
  if (error.type === 'StripeCardError') {
    return new PaymentError(`支付失败: ${error.message}`);
  }
  
  if (error.type === 'StripeInvalidRequestError') {
    return new ValidationError('支付请求无效');
  }
  
  if (error.type === 'StripeConnectionError') {
    return new ExternalServiceError('Stripe', '支付服务连接错误');
  }
  
  return new PaymentError('支付处理失败');
};

// API 错误处理
export const handleAPIError = (service: string, error: any): AppError => {
  if (error.response?.status === 404) {
    return new NotFoundError(`${service} 资源未找到`);
  }
  
  if (error.response?.status >= 400 && error.response?.status < 500) {
    return new ValidationError(`${service} 请求错误: ${error.message}`);
  }
  
  if (error.response?.status >= 500) {
    return new ExternalServiceError(service, `${service} 服务器错误`);
  }
  
  if (error.code === 'ECONNREFUSED') {
    return new ExternalServiceError(service, `${service} 服务不可用`);
  }
  
  if (error.code === 'ETIMEDOUT') {
    return new ExternalServiceError(service, `${service} 请求超时`);
  }
  
  return new ExternalServiceError(service, `${service} 未知错误`);
};

// 健康检查错误处理
export const healthCheckErrorHandler = (error: Error, service: string): any => {
  logger.error(`Health check failed for ${service}`, { error: error.message });
  
  return {
    service,
    status: 'error',
    error: error.message,
    timestamp: new Date().toISOString()
  };
};

// 批量错误处理
export const handleBatchErrors = <T>(
  items: T[],
  processor: (item: T) => Promise<any>
): Promise<{ success: T[]; failed: { item: T; error: Error }[] }> => {
  const results = { success: [] as T[], failed: [] as { item: T; error: Error }[] };
  
  return Promise.all(
    items.map(async (item) => {
      try {
        await processor(item);
        results.success.push(item);
      } catch (error) {
        results.failed.push({ item, error: error as Error });
      }
    })
  ).then(() => results);
};

// 错误重试包装器
export const withRetry = <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> => {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    const attempt = () => {
      attempts++;
      
      fn()
        .then(resolve)
        .catch((error) => {
          if (attempts >= maxAttempts) {
            reject(new AppError('重试次数已达上限', 500, 'RETRY_EXCEEDED'));
          } else {
            setTimeout(attempt, delay * attempts);
          }
        });
    };
    
    attempt();
  });
};

// 错误统计
export class ErrorTracker {
  private static errors: Map<string, number> = new Map();
  private static warnings: Map<string, number> = new Map();
  
  static recordError(code: string): void {
    const count = this.errors.get(code) || 0;
    this.errors.set(code, count + 1);
  }
  
  static recordWarning(code: string): void {
    const count = this.warnings.get(code) || 0;
    this.warnings.set(code, count + 1);
  }
  
  static getErrorStats(): { errors: Map<string, number>; warnings: Map<string, number> } {
    return {
      errors: new Map(this.errors),
      warnings: new Map(this.warnings)
    };
  }
  
  static reset(): void {
    this.errors.clear();
    this.warnings.clear();
  }
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  UploadError,
  PaymentError,
  ExternalServiceError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  formatValidationErrors,
  handleDatabaseError,
  handleAWSError,
  handlePaymentError,
  handleAPIError,
  healthCheckErrorHandler,
  handleBatchErrors,
  withRetry,
  ErrorTracker
};