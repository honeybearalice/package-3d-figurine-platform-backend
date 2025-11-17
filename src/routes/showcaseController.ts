import { Router } from 'express';
import { ImageService } from '../services/database';
import { asyncHandler } from '../middleware/error';
import { validateRequest } from '../middleware/validation';
import { authenticateToken, requireRole } from '../middleware/auth';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

// 创建展示池路由器
const router = Router();

// 获取展示池项目
export const getShowcaseItems = [
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 20, 
      style, 
      profession, 
      sort = 'new',
      featured 
    } = req.query;

    // 这里应该实现真实的展示池查询逻辑
    // 简化实现：从生成的图像中获取公开的项目
    
    const where: Prisma.ShowcaseItemWhereInput = {
      isPublic: true
    };

    if (featured === 'true') {
      where.featured = true;
    }

    if (style) {
      // 通过关联的图像过滤风格
      where.image = {
        style: style as string
      };
    }

    if (profession) {
      where.image = {
        ...where.image,
        profession: profession as string
      };
    }

    // 排序
    let orderBy: Prisma.ShowcaseItemOrderByWithRelationInput = {};
    switch (sort) {
      case 'popular':
        orderBy = { likeCount: 'desc' };
        break;
      case 'views':
        orderBy = { viewCount: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // 模拟数据
    const mockData = {
      items: [
        {
          id: '1',
          title: '我的第一个3D手办',
          description: '基于真实照片生成的高质量3D手办',
          tags: ['realistic', 'custom'],
          isPublic: true,
          featured: false,
          viewCount: 15,
          likeCount: 3,
          commentCount: 1,
          createdAt: new Date(),
          user: {
            id: 'user1',
            username: '用户1',
            avatar: '/images/avatars/user1.jpg'
          },
          image: {
            id: 'img1',
            generatedImage: '/images/generated/sample1.jpg',
            style: 'realistic',
            profession: 'student'
          },
          comments: [
            {
              id: 'comment1',
              content: '太棒了！质量很高！',
              createdAt: new Date(),
              user: {
                id: 'user2',
                username: '用户2'
              }
            }
          ]
        }
      ],
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: 1,
        totalPages: 1
      }
    };

    res.json({
      success: true,
      data: mockData.items,
      meta: mockData.pagination
    } as ApiResponse);
  })
];

// 获取单个展示项目
export const getShowcaseItem = [
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 模拟数据
    const mockItem = {
      id,
      title: '我的3D手办作品',
      description: '这是一个基于AI生成的3D手办，展现了完美的细节和质感。',
      tags: ['realistic', 'cyberpunk', 'high-quality'],
      isPublic: true,
      featured: true,
      viewCount: 42,
      likeCount: 8,
      commentCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user1',
        username: '创作者',
        avatar: '/images/avatars/user1.jpg'
      },
      image: {
        id: 'img1',
        generatedImage: '/images/generated/sample1.jpg',
        style: 'realistic',
        profession: 'scientist',
        prompt: 'realistic 3D figurine, high detail, photorealistic, professional photography, studio lighting, sharp focus, high resolution, 3D rendered, detailed texture, realistic materials, premium quality, wearing lab coat, holding test tube, intelligent expression, scientific instruments',
        createdAt: new Date()
      },
      comments: [
        {
          id: 'comment1',
          content: '太棒了！这个手办的质量真的很不错！',
          createdAt: new Date(),
          user: {
            id: 'user2',
            username: '评论者1',
            avatar: '/images/avatars/user2.jpg'
          }
        },
        {
          id: 'comment2',
          content: '我也想做一个类似的，能分享一下制作过程吗？',
          createdAt: new Date(),
          user: {
            id: 'user3',
            username: '评论者2'
          }
        }
      ]
    };

    // 增加查看次数
    // 实际实现中应该更新数据库

    res.json({
      success: true,
      data: mockItem
    } as ApiResponse);
  })
];

// 创建展示项目
export const createShowcaseItem = [
  authenticateToken,
  validateRequest('showcase', 'create'),
  asyncHandler(async (req, res) => {
    const { imageId, title, description, tags, isPublic } = req.body;

    // 验证图像是否属于当前用户
    const userImages = await ImageService.getUserGeneratedImages(req.user.id, {
      page: 1,
      limit: 1000
    });

    const image = userImages.images.find(img => img.id === imageId);
    if (!image) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'IMAGE_NOT_FOUND',
          message: '图像不存在或无权使用'
        }
      } as ApiResponse);
    }

    // 模拟创建展示项目
    const mockItem = {
      id: `showcase_${Date.now()}`,
      userId: req.user.id,
      imageId,
      title,
      description,
      tags: tags || [],
      isPublic: isPublic || false,
      featured: false,
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    logger.info('Showcase item created', { 
      itemId: mockItem.id,
      userId: req.user.id,
      isPublic 
    });

    res.status(201).json({
      success: true,
      data: mockItem
    } as ApiResponse);
  })
];

// 更新展示项目
export const updateShowcaseItem = [
  authenticateToken,
  validateRequest('showcase', 'update'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, tags, isPublic, featured } = req.body;

    // 模拟检查权限
    // 实际实现中应该检查项目是否属于当前用户或用户是管理员

    const updatedItem = {
      id,
      title,
      description,
      tags: tags || [],
      isPublic,
      featured,
      updatedAt: new Date()
    };

    logger.info('Showcase item updated', { 
      itemId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: updatedItem
    } as ApiResponse);
  })
];

// 删除展示项目
export const deleteShowcaseItem = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 模拟检查权限
    // 实际实现中应该检查项目是否属于当前用户

    logger.info('Showcase item deleted', { 
      itemId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: '展示项目删除成功'
      }
    } as ApiResponse);
  })
];

// 点赞展示项目
export const likeShowcaseItem = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // 模拟检查是否已经点赞
    const hasLiked = false; // 实际应该查询数据库

    if (hasLiked) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_LIKED',
          message: '已经点赞过了'
        }
      } as ApiResponse);
    }

    // 模拟增加点赞数
    const mockResult = {
      liked: true,
      likeCount: 15
    };

    logger.info('Showcase item liked', { 
      itemId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: mockResult
    } as ApiResponse);
  })
];

// 添加评论
export const addComment = [
  authenticateToken,
  validateRequest('comment', 'create'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { content, parentId } = req.body;

    const comment = {
      id: `comment_${Date.now()}`,
      userId: req.user.id,
      itemId: id,
      content,
      parentId: parentId || null,
      likeCount: 0,
      createdAt: new Date(),
      user: {
        id: req.user.id,
        username: req.user.username || '匿名用户',
        avatar: req.user.avatar || '/images/avatars/default.jpg'
      }
    };

    logger.info('Comment added to showcase item', { 
      commentId: comment.id,
      itemId: id,
      userId: req.user.id 
    });

    res.status(201).json({
      success: true,
      data: comment
    } as ApiResponse);
  })
];

// 获取评论
export const getComments = [
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // 模拟评论数据
    const mockComments = [
      {
        id: 'comment1',
        content: '这个手办做得真棒！',
        parentId: null,
        likeCount: 2,
        createdAt: new Date(),
        user: {
          id: 'user1',
          username: '用户1',
          avatar: '/images/avatars/user1.jpg'
        },
        replies: [
          {
            id: 'comment2',
            content: '谢谢夸奖！',
            parentId: 'comment1',
            likeCount: 0,
            createdAt: new Date(),
            user: {
              id: 'user2',
              username: '用户2',
              avatar: '/images/avatars/user2.jpg'
            }
          }
        ]
      }
    ];

    res.json({
      success: true,
      data: mockComments,
      meta: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: mockComments.length
      }
    } as ApiResponse);
  })
];

// 删除评论
export const deleteComment = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { id, commentId } = req.params;

    // 模拟检查权限（只能删除自己的评论或管理员）
    const canDelete = true; // 实际应该检查权限

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: '无权删除此评论'
        }
      } as ApiResponse);
    }

    logger.info('Comment deleted', { 
      commentId,
      itemId: id,
      userId: req.user.id 
    });

    res.json({
      success: true,
      data: {
        message: '评论删除成功'
      }
    } as ApiResponse);
  })
];

// 获取热门展示项目
export const getPopularShowcase = [
  asyncHandler(async (req, res) => {
    const { period = 'week', limit = 10 } = req.query;

    // 模拟热门数据
    const popularItems = [
      {
        id: '1',
        title: '经典动漫手办',
        thumbnail: '/images/generated/thumb1.jpg',
        likeCount: 45,
        viewCount: 120,
        author: '动漫爱好者',
        style: 'anime'
      },
      {
        id: '2',
        title: '未来科技风手办',
        thumbnail: '/images/generated/thumb2.jpg',
        likeCount: 38,
        viewCount: 95,
        author: '科技达人',
        style: 'cyberpunk'
      }
    ];

    res.json({
      success: true,
      data: popularItems,
      meta: {
        period,
        total: popularItems.length
      }
    } as ApiResponse);
  })
];

// 获取推荐展示项目
export const getRecommendedShowcase = [
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { limit = 10, style, profession } = req.query;

    // 基于用户偏好推荐
    const preferences = req.user?.preferences;
    const preferredStyle = preferences?.defaultStyle || 'realistic';

    // 模拟推荐数据
    const recommendedItems = [
      {
        id: 'rec1',
        title: `推荐：${preferredStyle}风格手办`,
        thumbnail: '/images/generated/recommended1.jpg',
        reason: '基于您的偏好推荐',
        matchScore: 0.95
      }
    ];

    res.json({
      success: true,
      data: recommendedItems,
      meta: {
        basedOn: 'user_preferences',
        userStyle: preferredStyle
      }
    } as ApiResponse);
  })
];

// 展示池控制器
export const showcaseController = {
  // 路由
  getShowcaseItems,
  getShowcaseItem,
  createShowcaseItem,
  updateShowcaseItem,
  deleteShowcaseItem,
  likeShowcaseItem,
  addComment,
  getComments,
  deleteComment,
  getPopularShowcase,
  getRecommendedShowcase,
  
  // 中间件
  requireAuth: authenticateToken,
  requireAdmin: requireRole(['admin', 'superadmin'])
};

export default router;