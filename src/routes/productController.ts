import { Router, Request, Response } from 'express';
import { ProductService } from '../services/database';
import { asyncHandler } from '../middleware/error';
import { validateRequest } from '../middleware/validation';
import { ValidationSchemas } from '../middleware/validation';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

// 创建商品路由器
const router = Router();

// 获取商品列表
export const getProducts = [
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, category, search, isActive, sortBy, sortOrder } = req.query;

    const result = await ProductService.getProducts({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      category: category as string,
      search: search as string,
      isActive: isActive !== 'false', // 默认为true
      sortBy: sortBy as string || 'createdAt',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
    });

    res.json({
      success: true,
      data: result.products,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages
      }
    } as ApiResponse);
  })
];

// 获取商品详情
export const getProduct = [
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await ProductService.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: '商品不存在'
        }
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: product
    } as ApiResponse);
  })
];

// 创建商品（管理员）
export const createProduct = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  validateRequest('product', 'create'),
  asyncHandler(async (req: Request, res: Response) => {
    const productData = req.body;

    const product = await ProductService.createProduct(productData);

    logger.info('Product created by admin', { 
      productId: product.id, 
      name: product.name,
      adminId: (req as any).user.id 
    });

    res.status(201).json({
      success: true,
      data: product
    } as ApiResponse);
  })
];

// 更新商品（管理员）
export const updateProduct = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  validateRequest('product', 'update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updateData = req.body;

    const product = await ProductService.updateProduct(id, updateData);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: '商品不存在'
        }
      } as ApiResponse);
    }

    logger.info('Product updated by admin', { 
      productId: id, 
      adminId: (req as any).user.id 
    });

    res.json({
      success: true,
      data: product
    } as ApiResponse);
  })
];

// 删除商品（管理员）
export const deleteProduct = [
  authenticateToken,
  requireRole(['admin', 'superadmin']),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const product = await ProductService.deleteProduct(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: '商品不存在'
        }
      } as ApiResponse);
    }

    logger.info('Product deleted by admin', { 
      productId: id, 
      adminId: (req as any).user.id 
    });

    res.json({
      success: true,
      data: {
        message: '商品删除成功'
      }
    } as ApiResponse);
  })
];

// 搜索商品
export const searchProducts = [
  asyncHandler(async (req: Request, res: Response) => {
    const { q, page = 1, limit = 20, category } = req.query;

    if (!q || (q as string).trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_SEARCH_QUERY',
          message: '搜索关键词不能为空'
        }
      } as ApiResponse);
    }

    const result = await ProductService.getProducts({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: q as string,
      category: category as string,
      isActive: true
    });

    res.json({
      success: true,
      data: result.products,
      meta: {
        page: result.pagination.page,
        limit: result.pagination.limit,
        total: result.pagination.total,
        totalPages: result.pagination.totalPages,
        query: q
      }
    } as ApiResponse);
  })
];

// 获取商品分类
export const getCategories = [
  asyncHandler(async (req: Request, res: Response) => {
    // 模拟分类数据，实际应该从数据库动态获取
    const categories = [
      {
        id: 'figurine',
        name: '3D手办',
        description: '定制3D打印手办',
        image: '/images/categories/figurine.jpg',
        count: 150
      },
      {
        id: 'accessory',
        name: '配件',
        description: '手办配件和装饰',
        image: '/images/categories/accessory.jpg',
        count: 75
      },
      {
        id: 'model',
        name: '模型',
        description: '各类3D模型',
        image: '/images/categories/model.jpg',
        count: 50
      }
    ];

    res.json({
      success: true,
      data: categories
    } as ApiResponse);
  })
];

// 获取热门商品
export const getPopularProducts = [
  asyncHandler(async (req: Request, res: Response) => {
    const { limit = 10 } = req.query;

    const result = await ProductService.getProducts({
      page: 1,
      limit: parseInt(limit as string),
      isActive: true,
      sortBy: 'viewCount', // 假设有查看次数字段
      sortOrder: 'desc'
    });

    res.json({
      success: true,
      data: result.products,
      meta: {
        total: result.pagination.total
      }
    } as ApiResponse);
  })
];

// 商品相关中间件和验证
export const productController = {
  // 路由
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  getCategories,
  getPopularProducts
};

// 导出路由器
export default router;