import { Request, Response } from 'express';
import { ImageService, UserService } from '../services/database';
import { doubaoAIService } from '../services/doubao';
import { ApiResponse, ImageGenerationRequest } from '../types';
import { logger } from '../utils/logger';
import { validateRequest } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/error';
import { v4 as uuidv4 } from 'uuid';

// 生成图像
export const generateImage = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      originalImage, 
      style, 
      profession, 
      customPrompt, 
      quality 
    }: ImageGenerationRequest = req.body;

    // 验证请求
    const validation = doubaoAIService.validateImageGenerationRequest({
      originalImage,
      style,
      profession,
      customPrompt,
      quality
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: validation.errors
        }
      } as ApiResponse);
    }

    // 检查用户生成次数限制
    const userGeneratedImages = await ImageService.getUserGeneratedImages(req.user.id, { 
      page: 1, 
      limit: 1000 
    });
    
    const maxGenerationsPerHour = getMaxGenerationsForUserLevel(req.user.level);
    const recentGenerations = userGeneratedImages.images.filter(image => {
      const imageTime = new Date(image.createdAt).getTime();
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      return imageTime > oneHourAgo;
    });

    if (recentGenerations.length >= maxGenerationsPerHour) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `每小时最多可生成 ${maxGenerationsPerHour} 张图像`
        }
      } as ApiResponse);
    }

    logger.info('Starting image generation', { 
      userId: req.user.id, 
      style, 
      profession,
      quality 
    });

    // 调用豆包AI生成图像
    const result = await doubaoAIService.generateFigurineImage(
      {
        originalImage,
        style,
        profession,
        customPrompt,
        quality
      },
      req.user.id,
      originalImage // 这里应该是上传后的图像URL
    );

    if (!result.success || !result.data) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'IMAGE_GENERATION_FAILED',
          message: result.error?.message || '图像生成失败'
        }
      } as ApiResponse);
    }

    // 保存生成的图像记录到数据库
    const savedImage = await ImageService.createGeneratedImage({
      userId: req.user.id,
      originalImage: result.data.originalImage,
      generatedImage: result.data.generatedImage,
      style: result.data.style,
      profession: result.data.profession,
      prompt: result.data.prompt,
      modelUsed: result.data.modelUsed,
      quality: result.data.quality
    });

    logger.info('Image generated and saved successfully', { 
      userId: req.user.id, 
      imageId: savedImage.id,
      style,
      profession 
    });

    res.json({
      success: true,
      data: {
        ...savedImage,
        // 包含生成成本和时间信息
        generationCost: doubaoAIService.estimateGenerationCost([{
          originalImage,
          style,
          profession,
          customPrompt,
          quality
        }])
      }
    } as ApiResponse);
  })
];

// 批量生成图像
export const batchGenerateImages = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const requests = req.body.requests as Array<{
      request: ImageGenerationRequest;
      priority?: 'low' | 'medium' | 'high';
    }>;

    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUESTS',
          message: '请求数据无效'
        }
      } as ApiResponse);
    }

    if (requests.length > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: '批量生成最多支持5个请求'
        }
      } as ApiResponse);
    }

    // 验证所有请求
    for (let i = 0; i < requests.length; i++) {
      const validation = doubaoAIService.validateImageGenerationRequest(requests[i].request);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `第 ${i + 1} 个请求验证失败`,
            details: validation.errors
          }
        } as ApiResponse);
      }
    }

    // 估算成本
    const costEstimate = doubaoAIService.estimateGenerationCost(
      requests.map(r => r.request)
    );

    logger.info('Starting batch image generation', { 
      userId: req.user.id, 
      requestCount: requests.length,
      estimatedCost: costEstimate.estimatedCost 
    });

    // 批量生成
    const result = await doubaoAIService.generateBatchImages(
      requests.map((item, index) => ({
        request: item.request,
        userId: req.user.id,
        originalImageUrl: item.request.originalImage,
        priority: item.priority || 'medium'
      }))
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'BATCH_GENERATION_FAILED',
          message: result.error?.message || '批量生成失败'
        }
      } as ApiResponse);
    }

    // 保存所有成功生成的图像
    const savedImages = [];
    for (const imageData of result.data || []) {
      const savedImage = await ImageService.createGeneratedImage({
        userId: req.user.id,
        originalImage: imageData.originalImage,
        generatedImage: imageData.generatedImage,
        style: imageData.style,
        profession: imageData.profession,
        prompt: imageData.prompt,
        modelUsed: imageData.modelUsed,
        quality: imageData.quality
      });
      savedImages.push(savedImage);
    }

    logger.info('Batch image generation completed', { 
      userId: req.user.id, 
      totalRequests: requests.length,
      successful: savedImages.length,
      failed: result.meta?.failed || 0
    });

    res.json({
      success: true,
      data: {
        images: savedImages,
        summary: {
          total: requests.length,
          successful: savedImages.length,
          failed: result.meta?.failed || 0,
          costEstimate: costEstimate
        }
      },
      meta: result.meta
    } as ApiResponse);
  })
];

// 获取用户生成历史
export const getUserGeneratedImages = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, style } = req.query;

    const result = await ImageService.getUserGeneratedImages(req.user.id, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      style: style as string
    });

    res.json({
      success: true,
      data: result.images,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 获取公开生成图像
export const getPublicGeneratedImages = [
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, style, sort = 'new' } = req.query;

    // 这里需要实现获取公开图像的逻辑
    // 简化实现，返回用户自己的公开图像作为示例
    const result = await ImageService.getUserGeneratedImages(req.user?.id || 'public', {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      style: style as string
    });

    // 过滤只显示公开的图像
    const publicImages = result.images.filter(image => image.isPublic);

    // 排序
    if (sort === 'popular') {
      publicImages.sort((a, b) => b.likes - a.likes);
    } else {
      publicImages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    res.json({
      success: true,
      data: publicImages,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: publicImages.length,
        totalPages: Math.ceil(publicImages.length / result.pagination.limit)
      }
    } as ApiResponse);
  })
];

// 更新图像隐私设置
export const toggleImagePrivacy = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { isPublic } = req.body;

    // 获取图像信息以验证所有权
    const userImages = await ImageService.getUserGeneratedImages(req.user.id, { 
      page: 1, 
      limit: 1000 
    });
    
    const image = userImages.images.find(img => img.id === id);
    if (!image) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: '图像不存在或无权访问'
        }
      } as ApiResponse);
    }

    const updatedImage = await ImageService.toggleImagePrivacy(id, isPublic);

    logger.info('Image privacy updated', { 
      userId: req.user.id, 
      imageId: id,
      isPublic 
    });

    res.json({
      success: true,
      data: updatedImage
    } as ApiResponse);
  })
];

// 删除生成图像
export const deleteGeneratedImage = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // 获取图像信息以验证所有权
    const userImages = await ImageService.getUserGeneratedImages(req.user.id, { 
      page: 1, 
      limit: 1000 
    });
    
    const image = userImages.images.find(img => img.id === id);
    if (!image) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: '图像不存在或无权删除'
        }
      } as ApiResponse);
    }

    const deletedImage = await ImageService.deleteGeneratedImage(id);

    logger.info('Generated image deleted', { 
      userId: req.user.id, 
      imageId: id 
    });

    res.json({
      success: true,
      data: {
        message: '图像删除成功'
      }
    } as ApiResponse);
  })
];

// 获取生成统计
export const getGenerationStats = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userImages = await ImageService.getUserGeneratedImages(req.user.id, { 
      page: 1, 
      limit: 1000 
    });

    const stats = {
      totalGenerated: userImages.pagination.total,
      byStyle: {
        realistic: 0,
        anime: 0,
        cyberpunk: 0,
        classic: 0
      },
      byProfession: {} as { [key: string]: number },
      totalDownloads: 0,
      totalLikes: 0,
      publicImages: 0,
      privateImages: 0
    };

    userImages.images.forEach(image => {
      stats.byStyle[image.style as keyof typeof stats.byStyle]++;
      if (image.profession) {
        stats.byProfession[image.profession] = (stats.byProfession[image.profession] || 0) + 1;
      }
      stats.totalDownloads += image.downloadCount;
      stats.totalLikes += image.likes;
      
      if (image.isPublic) {
        stats.publicImages++;
      } else {
        stats.privateImages++;
      }
    });

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  })
];

// 获取AI服务状态
export const getAIStatus = [
  asyncHandler(async (req: Request, res: Response) => {
    const usageStats = await doubaoAIService.getUsageStats();
    const isConfigured = !!(config.doubao.apiKey && config.doubao.endpoint);

    res.json({
      success: true,
      data: {
        isConfigured,
        isHealthy: usageStats.isHealthy,
        lastChecked: usageStats.lastChecked,
        responseTime: usageStats.responseTime,
        model: config.doubao.model,
        supportedStyles: ['realistic', 'anime', 'cyberpunk', 'classic'],
        supportedProfessions: ['student', 'business', 'artist', 'athlete', 'scientist', 'chef', 'musician', 'teacher', 'doctor', 'engineer'],
        qualityOptions: ['low', 'medium', 'high']
      }
    } as ApiResponse);
  })
];

// 重新生成图像（如果失败）
export const regenerateImage = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // 获取原始图像信息
    const userImages = await ImageService.getUserGeneratedImages(req.user.id, { 
      page: 1, 
      limit: 1000 
    });
    
    const originalImage = userImages.images.find(img => img.id === id);
    if (!originalImage) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: '图像不存在'
        }
      } as ApiResponse);
    }

    // 重新生成
    const result = await doubaoAIService.generateFigurineImage(
      {
        originalImage: originalImage.originalImage,
        style: originalImage.style as any,
        profession: originalImage.profession,
        quality: originalImage.quality as any
      },
      req.user.id,
      originalImage.originalImage
    );

    if (!result.success || !result.data) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'REGENERATION_FAILED',
          message: result.error?.message || '重新生成失败'
        }
      } as ApiResponse);
    }

    // 保存新的生成图像
    const newImage = await ImageService.createGeneratedImage({
      userId: req.user.id,
      originalImage: result.data.originalImage,
      generatedImage: result.data.generatedImage,
      style: result.data.style,
      profession: result.data.profession,
      prompt: result.data.prompt,
      modelUsed: result.data.modelUsed,
      quality: result.data.quality
    });

    logger.info('Image regenerated successfully', { 
      userId: req.user.id, 
      originalImageId: id,
      newImageId: newImage.id 
    });

    res.json({
      success: true,
      data: newImage
    } as ApiResponse);
  })
];

// 获取用户等级对应的最大生成次数
function getMaxGenerationsForUserLevel(level: string): number {
  const limits = {
    'regular': 10,    // 每天10次
    'vip': 50,        // 每天50次
    'premium': 200    // 每天200次
  };
  
  return limits[level as keyof typeof limits] || 10;
}

// 导出控制器函数
export default {
  generateImage,
  batchGenerateImages,
  getUserGeneratedImages,
  getPublicGeneratedImages,
  toggleImagePrivacy,
  deleteGeneratedImage,
  getGenerationStats,
  getAIStatus,
  regenerateImage
};