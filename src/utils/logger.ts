import winston from 'winston';
import { config } from '../config';
import path from 'path';

// 创建日志目录
import fs from 'fs';
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// 控制台格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// 创建 logger 实例
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { 
    service: 'moletech-3d-figurine-backend',
    version: '1.0.0'
  },
  transports: [
    // 文件日志 - 错误级别
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: logFormat
    }),
    
    // 文件日志 - 综合日志
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      format: logFormat
    }),
  ],
});

// 开发环境下添加控制台输出
if (config.nodeEnv !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// 生产环境下只输出重要信息
if (config.nodeEnv === 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'info'
  }));
}

// 创建特定模块的 logger
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// 创建 HTTP 请求 logger
export const createHttpLogger = () => {
  return winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { 
      service: 'moletech-http-logger'
    },
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'http.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: logFormat
      })
    ]
  });
};

// 创建业务日志 logger
export const createBusinessLogger = () => {
  return winston.createLogger({
    level: 'info',
    format: logFormat,
    defaultMeta: { 
      service: 'moletech-business-logger'
    },
    transports: [
      new winston.transports.File({
        filename: path.join(logDir, 'business.log'),
        maxsize: 10485760, // 10MB
        maxFiles: 10,
        format: logFormat
      })
    ]
  });
};

// 导出默认 logger
export default logger;