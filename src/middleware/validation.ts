import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

// 验证中间件
export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation failed', { 
        errors, 
        property,
        ip: req.ip,
        url: req.url,
        method: req.method 
      });

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: errors
        }
      };
      return res.status(400).json(response);
    }

    req[property] = value;
    next();
  };
};

// 参数验证中间件
export const validateParams = (schema: Joi.ObjectSchema) => validate(schema, 'params');

// 查询验证中间件
export const validateQuery = (schema: Joi.ObjectSchema) => validate(schema, 'query');

// 身体验证中间件
export const validateBody = (schema: Joi.ObjectSchema) => validate(schema, 'body');

// 预定义验证模式
export const ValidationSchemas = {
  // 用户相关
  user: {
    register: Joi.object({
      username: Joi.string().alphanum().min(3).max(30).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required(),
      phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).optional()
    }),
    
    login: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    }),
    
    update: Joi.object({
      username: Joi.string().alphanum().min(3).max(30).optional(),
      email: Joi.string().email().optional(),
      phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).optional(),
      avatar: Joi.string().uri().optional()
    }),
    
    changePassword: Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]')).required()
    })
  },

  // 订单相关
  order: {
    create: Joi.object({
      items: Joi.array().items(
        Joi.object({
          productId: Joi.string().required(),
          imageId: Joi.string().optional(),
          quantity: Joi.number().integer().min(1).required(),
          selectedSizeId: Joi.string().required(),
          selectedAccessories: Joi.array().items(
            Joi.object({
              accessoryId: Joi.string().required(),
              quantity: Joi.number().integer().min(1).default(1),
              position: Joi.string().optional()
            })
          ).default([]),
          customizations: Joi.array().items(
            Joi.object({
              type: Joi.string().valid('text', 'color', 'emblem').required(),
              value: Joi.string().required(),
              price: Joi.number().min(0).default(0)
            })
          ).default([])
        })
      ).min(1).required(),
      shippingInfo: Joi.object({
        recipient: Joi.string().min(1).max(100).required(),
        phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).required(),
        address: Joi.string().min(5).max(200).required(),
        city: Joi.string().min(1).max(50).required(),
        state: Joi.string().min(1).max(50).required(),
        country: Joi.string().min(1).max(50).required(),
        postalCode: Joi.string().min(3).max(20).required(),
        shippingMethod: Joi.string().valid('standard', 'express', 'international').required()
      }).required(),
      paymentMethod: Joi.string().valid('wechat', 'alipay', 'stripe', 'paypal', 'credit_card', 'bank_transfer').required()
    }),
    
    updateStatus: Joi.object({
      status: Joi.string().valid('pending', 'confirmed', 'design_approved', 'in_production', 'quality_check', 'packaging', 'shipped', 'delivered', 'cancelled').required(),
      note: Joi.string().max(500).optional()
    })
  },

  // 商品相关
  product: {
    create: Joi.object({
      name: Joi.string().min(1).max(255).required(),
      description: Joi.string().min(10).max(2000).required(),
      basePrice: Joi.number().min(0).required(),
      category: Joi.string().valid('figurine', 'accessory', 'model').required(),
      isCustomizable: Joi.boolean().default(true),
      images: Joi.array().items(Joi.string().uri()).min(1).required(),
      specifications: Joi.object({
        material: Joi.string().valid('PLA', 'ABS', 'Resin', 'Metal', 'Wood').required(),
        weight: Joi.number().min(0).required(),
        dimensions: Joi.object({
          width: Joi.number().min(0).required(),
          height: Joi.number().min(0).required(),
          depth: Joi.number().min(0).required()
        }).required(),
        colors: Joi.array().items(Joi.string()).min(1).required()
      }).required(),
      sizes: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          dimensions: Joi.string().required(),
          price: Joi.number().min(0).required(),
          isPopular: Joi.boolean().default(false)
        })
      ).min(1).required(),
      accessories: Joi.array().items(Joi.string()).default([])
    }),
    
    update: Joi.object({
      name: Joi.string().min(1).max(255).optional(),
      description: Joi.string().min(10).max(2000).optional(),
      basePrice: Joi.number().min(0).optional(),
      category: Joi.string().valid('figurine', 'accessory', 'model').optional(),
      isCustomizable: Joi.boolean().optional(),
      isActive: Joi.boolean().optional(),
      images: Joi.array().items(Joi.string().uri()).optional()
    })
  },

  // 配件相关
  accessory: {
    create: Joi.object({
      name: Joi.string().min(1).max(100).required(),
      description: Joi.string().min(5).max(500).required(),
      price: Joi.number().min(0).required(),
      image: Joi.string().uri().required(),
      category: Joi.string().valid('headwear', 'clothing', 'props', 'base', 'decoration', 'tech').required(),
      maxQuantity: Joi.number().integer().min(1).max(10).default(1),
      is3DPreviewAvailable: Joi.boolean().default(false)
    }),
    
    update: Joi.object({
      name: Joi.string().min(1).max(100).optional(),
      description: Joi.string().min(5).max(500).optional(),
      price: Joi.number().min(0).optional(),
      category: Joi.string().valid('headwear', 'clothing', 'props', 'base', 'decoration', 'tech').optional(),
      maxQuantity: Joi.number().integer().min(1).max(10).optional(),
      is3DPreviewAvailable: Joi.boolean().optional(),
      isActive: Joi.boolean().optional()
    })
  },

  // 图像生成相关
  image: {
    generate: Joi.object({
      originalImage: Joi.string().required(),
      style: Joi.string().valid('realistic', 'anime', 'cyberpunk', 'classic').required(),
      profession: Joi.string().valid('student', 'business', 'artist', 'athlete', 'scientist', 'chef', 'musician', 'teacher', 'doctor', 'engineer').optional(),
      customPrompt: Joi.string().max(500).optional(),
      quality: Joi.string().valid('low', 'medium', 'high').default('medium')
    })
  },

  // 展示池相关
  showcase: {
    create: Joi.object({
      imageId: Joi.string().required(),
      title: Joi.string().min(1).max(100).required(),
      description: Joi.string().min(5).max(1000).optional(),
      tags: Joi.array().items(Joi.string().max(30)).max(10).default([]),
      isPublic: Joi.boolean().default(false)
    }),
    
    update: Joi.object({
      title: Joi.string().min(1).max(100).optional(),
      description: Joi.string().min(5).max(1000).optional(),
      tags: Joi.array().items(Joi.string().max(30)).max(10).optional(),
      isPublic: Joi.boolean().optional(),
      featured: Joi.boolean().optional()
    })
  },

  // 购物车相关
  cart: {
    add: Joi.object({
      productId: Joi.string().required(),
      imageId: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).required(),
      selectedSizeId: Joi.string().required(),
      selectedAccessories: Joi.array().items(
        Joi.object({
          accessoryId: Joi.string().required(),
          quantity: Joi.number().integer().min(1).default(1),
          position: Joi.string().optional()
        })
      ).default([]),
      customizations: Joi.array().items(
        Joi.object({
          type: Joi.string().valid('text', 'color', 'emblem').required(),
          value: Joi.string().required(),
          price: Joi.number().min(0).default(0)
        })
      ).default([])
    }),
    
    update: Joi.object({
      quantity: Joi.number().integer().min(1).optional(),
      selectedAccessories: Joi.array().items(
        Joi.object({
          accessoryId: Joi.string().required(),
          quantity: Joi.number().integer().min(1).default(1),
          position: Joi.string().optional()
        })
      ).optional()
    })
  },

  // 评论相关
  comment: {
    create: Joi.object({
      itemId: Joi.string().required(),
      content: Joi.string().min(1).max(1000).required(),
      parentId: Joi.string().optional()
    })
  },

  // 文件上传相关
  upload: {
    file: Joi.object({
      type: Joi.string().valid('image', 'video', 'document').required(),
      folder: Joi.string().max(100).optional()
    })
  },

  // 分页相关
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // 搜索相关
  search: Joi.object({
    q: Joi.string().min(1).max(100).required(),
    category: Joi.string().optional(),
    style: Joi.string().optional(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional()
  })
};

// 快速验证中间件
export const validateRequest = (schemaName: keyof typeof ValidationSchemas, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const schema = (ValidationSchemas as any)[schemaName];
    const actualSchema = typeof schema === 'object' && property in schema ? (schema as any)[property] : schema;
    
    if (!actualSchema) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SCHEMA_NOT_FOUND',
          message: '验证模式未找到'
        }
      });
    }

    return validate(actualSchema, property)(req, res, next);
  };
};