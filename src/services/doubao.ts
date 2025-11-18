import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ImageGenerationRequest, ApiResponse, GeneratedImage } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class DoubaoAIService {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor() {
    this.apiKey = config.doubao.apiKey;
    this.baseURL = config.doubao.endpoint;
    this.model = config.doubao.model;
  }

  /**
   * 生成 3D 手办图像
   */
  async generateFigurineImage(
    request: ImageGenerationRequest,
    userId: string,
    originalImageUrl: string
  ): Promise<ApiResponse<GeneratedImage>> {
    try {
      // 构建详细提示词
      const prompt = this.buildPrompt(request);
      
      // 准备请求数据
      const requestData = {
        model: this.model,
        prompt: prompt,
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size: this.getSizeForQuality(request.quality),
        stream: false,
        watermark: true
      };

      logger.info('Generating image with Doubao AI', { 
        userId, 
        style: request.style, 
        profession: request.profession,
        quality: request.quality 
      });

      // 发送请求到豆包API
      const response = await axios.post(this.baseURL, requestData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 30000,
      });

      logger.info('Doubao AI response received', { 
        userId, 
        status: response.status,
        dataLength: response.data?.data?.length || 0
      });

      // 处理响应
      if (response.data?.data && response.data.data[0]?.url) {
        const generatedImageData: GeneratedImage = {
          id: uuidv4(),
          userId: userId,
          originalImage: originalImageUrl,
          generatedImage: response.data.data[0].url,
          style: request.style,
          profession: request.profession || null,
          prompt: prompt,
          modelUsed: this.model,
          quality: request.quality,
          isPublic: false,
          createdAt: new Date(),
          downloadCount: 0,
          likes: 0,
        };

        logger.info('Image generation completed successfully', { 
          userId, 
          imageId: generatedImageData.id,
          generatedImageUrl: response.data.data[0].url
        });

        return {
          success: true,
          data: generatedImageData
        };
      } else {
        throw new Error('无效的AI服务响应格式');
      }

    } catch (error) {
      logger.error('Doubao AI generation failed', { 
        userId, 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return {
        success: false,
        error: {
          code: 'AI_GENERATION_ERROR',
          message: error instanceof Error ? error.message : 'AI图像生成失败'
        }
      };
    }
  }

  /**
   * 批量生成图像
   */
  async generateBatchImages(
    requests: Array<{
      request: ImageGenerationRequest;
      userId: string;
      originalImageUrl: string;
    }>
  ): Promise<ApiResponse<GeneratedImage[]>> {
    try {
      const results: GeneratedImage[] = [];
      const errors: string[] = [];

      // 限制并发数量
      const concurrency = config.business.maxImageGenerationConcurrency;
      const chunks = this.chunkArray(requests, concurrency);

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (item) => {
          try {
            const result = await this.generateFigurineImage(
              item.request, 
              item.userId, 
              item.originalImageUrl
            );
            
            if (result.success && result.data) {
              return result.data;
            } else {
              errors.push(`User ${item.userId}: ${result.error?.message || 'Generation failed'}`);
              return null;
            }
          } catch (error) {
            const errorMsg = `User ${item.userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            logger.error('Batch image generation error', { error: errorMsg });
            return null;
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults.filter(item => item !== null) as GeneratedImage[]);
      }

      logger.info('Batch image generation completed', { 
        totalRequests: requests.length,
        successful: results.length,
        failed: errors.length
      });

      return {
        success: true,
        data: results,
        meta: {
          total: requests.length
        },
        error: errors.length > 0 ? {
          code: 'BATCH_GENERATION_PARTIAL_ERROR',
          message: `${errors.length} requests failed`
        } : undefined
      };

    } catch (error) {
      logger.error('Batch image generation failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        success: false,
        error: {
          code: 'BATCH_GENERATION_ERROR',
          message: error instanceof Error ? error.message : '批量图像生成失败'
        }
      };
    }
  }

  /**
   * 构建详细的提示词
   */
  private buildPrompt(request: ImageGenerationRequest): string {
    const stylePrompts = {
      realistic: 'realistic 3D figurine, high detail, photorealistic, professional photography, studio lighting, sharp focus, high resolution, 3D rendered, detailed texture, realistic materials, premium quality',
      anime: 'anime style 3D figurine, cute, kawaii, manga style, vibrant colors, smooth shading, cel shading, 3D anime model, detailed character design, expressive eyes, high quality rendering',
      cyberpunk: 'cyberpunk 3D figurine, neon glow, futuristic, sci-fi, high-tech, metallic surfaces, LED lights, urban dystopian, dark atmosphere, cyber aesthetic, 3D render, advanced technology',
      classic: 'classic style 3D figurine, timeless design, traditional, elegant, artistic, museum quality, detailed craftsmanship, premium materials, sophisticated look, classical aesthetics'
    };

    const professionPrompts = {
      student: 'wearing student uniform, school bag, books, young energetic pose, academic accessories',
      business: 'wearing business suit, briefcase, confident professional pose, corporate attire',
      artist: 'holding paintbrush and palette, creative pose, artistic clothing, creative accessories',
      athlete: 'in sportswear, athletic pose, energetic, dynamic movement, sports equipment',
      scientist: 'wearing lab coat, holding test tube, intelligent expression, scientific instruments',
      chef: 'wearing chef hat and apron, holding cooking utensils, culinary pose, kitchen accessories',
      musician: 'holding musical instrument, musical note accessories, artistic pose, musical elements',
      teacher: 'holding books and pointer, teaching pose, professional educator look, academic accessories',
      doctor: 'wearing medical coat, stethoscope, caring expression, medical equipment',
      engineer: 'wearing hard hat and safety vest, holding blueprint, technical pose, engineering tools'
    };

    let basePrompt = stylePrompts[request.style as keyof typeof stylePrompts] || stylePrompts.realistic;
    let professionPrompt = request.profession ? 
      professionPrompts[request.profession as keyof typeof professionPrompts] : '';
    let customPrompt = request.customPrompt || '';

    // 组合提示词
    const fullPrompt = [
      basePrompt,
      professionPrompt,
      customPrompt,
      '3D printed figurine, collectible, high quality, detailed modeling, premium finish',
      'product photography, clean background, professional lighting, commercial quality',
      '4K resolution, ultra detailed, masterpiece, award winning, trending on artstation',
      'perfect pose, dynamic composition, studio quality, commercial photography'
    ].filter(Boolean).join(', ');

    return fullPrompt;
  }

  /**
   * 根据质量等级获取图像尺寸
   */
  private getSizeForQuality(quality: 'low' | 'medium' | 'high'): string {
    const qualityMap = {
      low: '1K',
      medium: '1K', 
      high: '2K'
    };
    
    return qualityMap[quality] || '1K';
  }

  /**
   * 数组分块函数
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 检查API连接状态
   */
  async checkAPIHealth(): Promise<boolean> {
    try {
      // 发送一个简单的测试请求
      const testRequest = {
        model: this.model,
        prompt: 'test image',
        size: '1K',
        stream: false
      };

      const response = await axios.post(this.baseURL, testRequest, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        timeout: 5000
      });

      return response.status === 200;
    } catch (error) {
      logger.error('Doubao API health check failed', { 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * 获取API使用统计
   */
  async getUsageStats(): Promise<{
    isHealthy: boolean;
    lastChecked: Date;
    responseTime: number;
  }> {
    const start = Date.now();
    
    try {
      const isHealthy = await this.checkAPIHealth();
      const responseTime = Date.now() - start;
      
      return {
        isHealthy,
        lastChecked: new Date(),
        responseTime
      };
    } catch (error) {
      return {
        isHealthy: false,
        lastChecked: new Date(),
        responseTime: Date.now() - start
      };
    }
  }

  /**
   * 验证图像质量
   */
  validateImageGenerationRequest(request: ImageGenerationRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 验证必需字段
    if (!request.originalImage) {
      errors.push('原始图像不能为空');
    }

    if (!request.style || !['realistic', 'anime', 'cyberpunk', 'classic'].includes(request.style)) {
      errors.push('风格参数无效');
    }

    if (!request.quality || !['low', 'medium', 'high'].includes(request.quality)) {
      errors.push('质量参数无效');
    }

    if (request.customPrompt && request.customPrompt.length > 500) {
      errors.push('自定义提示词长度不能超过500字符');
    }

    if (request.profession && !['student', 'business', 'artist', 'athlete', 'scientist', 'chef', 'musician', 'teacher', 'doctor', 'engineer'].includes(request.profession)) {
      errors.push('职业参数无效');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 预估生成成本
   */
  estimateGenerationCost(requests: ImageGenerationRequest[]): {
    estimatedCost: number;
    estimatedTime: number;
    currency: string;
  } {
    // 基于质量等级的基础成本
    const costPerImage = {
      low: 0.1,
      medium: 0.2,
      high: 0.5
    };

    // 基础时间（秒）
    const baseTime = 10;
    const qualityMultiplier = {
      low: 1,
      medium: 1.5,
      high: 2
    };

    const totalCost = requests.reduce((sum, request) => {
      return sum + (costPerImage[request.quality] || 0.2);
    }, 0);

    const maxTime = Math.max(...requests.map(request => 
      baseTime * (qualityMultiplier[request.quality] || 1.5)
    ));

    return {
      estimatedCost: Math.round(totalCost * 100) / 100, // 保留2位小数
      estimatedTime: Math.ceil(maxTime),
      currency: 'USD'
    };
  }
}

// 导出单例实例
export const doubaoAIService = new DoubaoAIService();
export default doubaoAIService;