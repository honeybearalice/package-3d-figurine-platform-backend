import multer from 'multer';
import multerS3 from 'multer-s3';
import { Request } from 'express';
import AWS from 'aws-sdk';
import path from 'path';
// 可选加载 sharp，避免构建环境缺少 libvips 导致安装失败
let sharp: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  sharp = require('sharp');
} catch (e) {
  sharp = null;
}
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { generateFileName, isImageFile } from '../utils';




// AWS S3 配置
const s3Config: AWS.S3.ClientConfiguration = {
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
};

// 中国区域需要特殊处理
if (config.aws.region === 'cn-north-1' || config.aws.region?.startsWith('cn-')) {
  s3Config.endpoint = config.aws.endpoint || `https://s3.${config.aws.region}.amazonaws.com.cn`;
  s3Config.s3ForcePathStyle = true; // 中国区域需要强制路径风格
}

const s3 = new AWS.S3(s3Config);

// 基础存储配置
const storage = multer.memoryStorage();

// 文件过滤器
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = config.upload.allowedTypes;
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`不支持的文件类型: ${file.mimetype}. 支持的类型: ${allowedTypes.join(', ')}`));
  }
};

// 基础 multer 配置
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 5, // 最多5个文件
    fields: 10, // 最多10个字段
  },
});

// S3 存储配置
const s3Storage = multerS3({
  s3,
  bucket: config.aws.bucketName,
  acl: 'public-read',
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file) => {
    const folder = req.body.folder || 'uploads';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6);
    const extension = path.extname(file.originalname);
    
    return `${folder}/${timestamp}_${random}${extension}`;
  },
  metadata: (req, file) => {
    return {
      fieldName: file.fieldname,
      originalName: file.originalname,
      uploadedBy: req.user?.id || 'anonymous',
      uploadedAt: new Date().toISOString()
    };
  }
});

// S3 multer 配置
const uploadS3 = multer({
  storage: s3Storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 5,
    fields: 10,
  },
});

// 图像处理函数
const processImage = async (
  file: Express.Multer.File,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  } = {}
) => {
  const { width, height, quality = 80, format = 'jpeg' } = options;
  
  let imageBuffer = file.buffer;
  
  // 如果是图像文件且 sharp 可用，进行优化处理
  if (isImageFile(file.originalname) && sharp) {
    try {
      let sharpInstance = sharp(imageBuffer);
      
      // 调整大小
      if (width || height) {
        sharpInstance = sharpInstance.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      // 转换为指定格式
      switch (format) {
        case 'jpeg':
          imageBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
          break;
        case 'png':
          imageBuffer = await sharpInstance.png({ quality }).toBuffer();
          break;
        case 'webp':
          imageBuffer = await sharpInstance.webp({ quality }).toBuffer();
          break;
      }
      
      logger.debug('Image processed successfully', {
        originalSize: file.size,
        processedSize: imageBuffer.length,
        format,
        width,
        height
      });
      
    } catch (error) {
      logger.error('Image processing failed', { error });
      throw new Error('图像处理失败');
    }
  }
  
  return imageBuffer;
};

// 创建文件上传中间件
export const createFileUpload = (options: {
  fieldName: string;
  folder?: string;
  processImage?: boolean;
  imageOptions?: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'jpeg' | 'png' | 'webp';
  };
  useS3?: boolean;
  maxFiles?: number;
} = {}) => {
  const {
    fieldName,
    folder = 'uploads',
    processImage: shouldProcessImage = false,
    imageOptions = {},
    useS3 = true,
    maxFiles = 1
  } = options;

  return (req: Request, res: any, next: any) => {
    const uploadConfig = useS3 ? uploadS3 : upload;
    
    uploadConfig.fields([
      {
        name: fieldName,
        maxCount: maxFiles
      }
    ])(req, res, async (err) => {
      if (err) {
        logger.error('File upload error', { error: err.message, fieldName });
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message
          }
        });
      }

      // 处理图像
      if (shouldProcessImage && req.files && req.files[fieldName]) {
        try {
          const processedFiles = [];
          
          for (const file of req.files[fieldName]) {
            if (isImageFile(file.originalname)) {
              const processedBuffer = await processImage(file, imageOptions);
              
              // 如果使用S3，上传处理后的文件
              if (useS3) {
                const processedKey = file.key.replace(
                  path.extname(file.key),
                  `_processed.${imageOptions.format || 'jpeg'}`
                );
                
                const uploadParams = {
                  Bucket: config.aws.bucketName,
                  Key: processedKey,
                  Body: processedBuffer,
                  ACL: 'public-read',
                  ContentType: `image/${imageOptions.format || 'jpeg'}`
                };
                
                await s3.upload(uploadParams).promise();
                file.processedUrl = `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${processedKey}`;
              }
              
              processedFiles.push({
                ...file,
                buffer: processedBuffer,
                size: processedBuffer.length
              });
            } else {
              processedFiles.push(file);
            }
          }
          
          req.files[fieldName] = processedFiles;
        } catch (error) {
          logger.error('Image processing error', { error });
          return res.status(500).json({
            success: false,
            error: {
              code: 'IMAGE_PROCESSING_ERROR',
              message: '图像处理失败'
            }
          });
        }
      }

      next();
    });
  };
};

// 预定义的中间件
export const uploadSingle = createFileUpload({ fieldName: 'file', maxFiles: 1 });
export const uploadMultiple = createFileUpload({ fieldName: 'files', maxFiles: 5 });
export const uploadImage = createFileUpload({ 
  fieldName: 'image', 
  processImage: true, 
  imageOptions: { width: 1200, height: 1200, quality: 85, format: 'webp' }
});
export const uploadAvatar = createFileUpload({
  fieldName: 'avatar',
  processImage: true,
  imageOptions: { width: 200, height: 200, quality: 80, format: 'jpeg' }
});
export const uploadProductImage = createFileUpload({
  fieldName: 'productImage',
  processImage: true,
  imageOptions: { width: 800, height: 600, quality: 90, format: 'webp' }
});

// 智能上传（根据文件类型自动处理）
export const uploadSmart = (req: Request, res: any, next: any) => {
  const files = req.files;
  
  if (!files) {
    return next();
  }

  const processPromises = Object.keys(files).map(async (fieldName) => {
    const fieldFiles = files[fieldName] as Express.Multer.File[];
    
    return Promise.all(fieldFiles.map(async (file) => {
      if (isImageFile(file.originalname)) {
        try {
          const processedBuffer = await processImage(file, { width: 1200, quality: 85 });
          file.buffer = processedBuffer;
          file.size = processedBuffer.length;
        } catch (error) {
          logger.error('Smart upload processing failed', { fieldName, error });
        }
      }
    }));
  });

  Promise.all(processPromises)
    .then(() => next())
    .catch((error) => {
      logger.error('Smart upload error', { error });
      return res.status(500).json({
        success: false,
        error: {
          code: 'SMART_UPLOAD_ERROR',
          message: '智能上传处理失败'
        }
      });
    });
};

// 删除文件函数
export const deleteFile = async (key: string): Promise<boolean> => {
  try {
    await s3.deleteObject({
      Bucket: config.aws.bucketName,
      Key: key
    }).promise();
    
    logger.info('File deleted successfully', { key });
    return true;
  } catch (error) {
    logger.error('File deletion failed', { key, error });
    return false;
  }
};

// 批量删除文件
export const deleteFiles = async (keys: string[]): Promise<{ success: string[]; failed: string[] }> => {
  const result = { success: [] as string[], failed: [] as string[] };
  
  const deletePromises = keys.map(async (key) => {
    try {
      await s3.deleteObject({
        Bucket: config.aws.bucketName,
        Key: key
      }).promise();
      result.success.push(key);
    } catch (error) {
      logger.error('Batch delete failed', { key, error });
      result.failed.push(key);
    }
  });
  
  await Promise.allSettled(deletePromises);
  
  return result;
};

// 生成文件URL
export const generateFileUrl = (key: string): string => {
  const domain = config.aws.region?.startsWith('cn-')
    ? 'amazonaws.com.cn'
    : 'amazonaws.com';
  return `https://${config.aws.bucketName}.s3.${config.aws.region}.${domain}/${key}`;
};

// 获取文件信息
export const getFileInfo = async (key: string) => {
  try {
    const headParams = {
      Bucket: config.aws.bucketName,
      Key: key
    };
    
    const headResult = await s3.headObject(headParams).promise();
    
    return {
      key,
      size: headResult.ContentLength,
      type: headResult.ContentType,
      lastModified: headResult.LastModified,
      etag: headResult.ETag,
      url: generateFileUrl(key)
    };
  } catch (error) {
    logger.error('Get file info failed', { key, error });
    return null;
  }
};

// 复制文件
export const copyFile = async (sourceKey: string, destinationKey: string): Promise<boolean> => {
  try {
    await s3.copyObject({
      Bucket: config.aws.bucketName,
      CopySource: `${config.aws.bucketName}/${sourceKey}`,
      Key: destinationKey,
      ACL: 'public-read'
    }).promise();
    
    logger.info('File copied successfully', { sourceKey, destinationKey });
    return true;
  } catch (error) {
    logger.error('File copy failed', { sourceKey, destinationKey, error });
    return false;
  }
};

// 移动文件
export const moveFile = async (sourceKey: string, destinationKey: string): Promise<boolean> => {
  const copied = await copyFile(sourceKey, destinationKey);
  if (copied) {
    return await deleteFile(sourceKey);
  }
  return false;
};

export default {
  upload,
  uploadS3,
  createFileUpload,
  uploadSingle,
  uploadMultiple,
  uploadImage,
  uploadAvatar,
  uploadProductImage,
  uploadSmart,
  deleteFile,
  deleteFiles,
  generateFileUrl,
  getFileInfo,
  copyFile,
  moveFile
};