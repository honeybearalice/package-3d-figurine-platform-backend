import { Request, Response } from 'express';
import { CartService, ProductService, UserService } from '../services/database';
import { ApiResponse, CartItemData } from '../types';
import { logger } from '../utils/logger';
import { validateRequest } from '../middleware/validation';
import { authenticateToken } from '../middleware/auth';
import { asyncHandler, NotFoundError } from '../middleware/error';
import { config } from '../config';

// 获取购物车
export const getCart = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const cart = await CartService.getUserCart(req.user.id);

    // 计算购物车统计
    const stats = {
      totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: cart.total,
      itemCount: cart.items.length,
      averageItemPrice: cart.items.length > 0 ? cart.total / cart.items.length : 0
    };

    res.json({
      success: true,
      data: {
        items: cart.items,
        stats
      }
    } as ApiResponse);
  })
];

// 添加到购物车
export const addToCart = [
  authenticateToken,
  validateRequest('cart', 'add'),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      productId,
      imageId,
      quantity,
      selectedSizeId,
      selectedAccessories,
      customizations
    } = req.body;

    // 验证商品是否存在
    const product = await ProductService.getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: '商品不存在'
        }
      } as ApiResponse);
    }

    // 验证商品是否激活
    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PRODUCT_INACTIVE',
          message: '商品已下架'
        }
      } as ApiResponse);
    }

    // 验证尺寸
    const selectedSize = product.specifications?.sizes.find(size => size.id === selectedSizeId);
    if (!selectedSize) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SIZE',
          message: '选择的尺寸无效'
        }
      } as ApiResponse);
    }

    // 验证配件（最多3个）
    if (selectedAccessories && selectedAccessories.length > 3) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_ACCESSORIES',
          message: '最多只能选择3个配件'
        }
      } as ApiResponse);
    }

    // 计算价格
    let unitPrice = product.basePrice + selectedSize.price;
    let totalPrice = unitPrice * quantity;

    // 添加配件价格
    if (selectedAccessories) {
      for (const accessory of selectedAccessories) {
        // 验证配件是否存在
        const accessoryData = product.accessories?.find(acc => acc.accessory.id === accessory.accessoryId);
        if (!accessoryData) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_ACCESSORY',
              message: `配件 ${accessory.accessoryId} 不存在`
            }
          } as ApiResponse);
        }
        totalPrice += accessoryData.accessory.price * accessory.quantity;
      }
    }

    // 添加定制价格
    if (customizations) {
      for (const customization of customizations) {
        totalPrice += customization.price;
      }
    }

    // 检查购物车商品数量限制
    const currentCart = await CartService.getUserCart(req.user.id);
    if (currentCart.items.length >= config.business.maxCartItems) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CART_LIMIT_EXCEEDED',
          message: `购物车最多只能容纳 ${config.business.maxCartItems} 件商品`
        }
      } as ApiResponse);
    }

    // 添加到购物车
    const cartItem = await CartService.addToCart({
      userId: req.user.id,
      productId,
      imageId,
      quantity,
      selectedSizeId,
      selectedAccessories: selectedAccessories || [],
      customizations: customizations || [],
      unitPrice,
      totalPrice
    });

    logger.info('Item added to cart', { 
      userId: req.user.id, 
      productId,
      quantity,
      totalPrice 
    });

    res.status(201).json({
      success: true,
      data: cartItem
    } as ApiResponse);
  })
];

// 更新购物车商品
export const updateCartItem = [
  authenticateToken,
  validateRequest('cart', 'update'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { quantity, selectedAccessories } = req.body;

    // 获取当前购物车商品
    const currentCart = await CartService.getUserCart(req.user.id);
    const cartItem = currentCart.items.find(item => item.id === id);

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CART_ITEM_NOT_FOUND',
          message: '购物车商品不存在'
        }
      } as ApiResponse);
    }

    // 重新计算价格（如果数量或配件有变化）
    let newTotalPrice = cartItem.totalPrice;
    
    if (quantity && quantity !== cartItem.quantity) {
      // 按新数量重新计算
      newTotalPrice = cartItem.unitPrice * quantity;
    }

    if (selectedAccessories) {
      // 验证配件数量限制
      if (selectedAccessories.length > 3) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TOO_MANY_ACCESSORIES',
            message: '最多只能选择3个配件'
          }
        } as ApiResponse);
      }

      // 重新计算配件价格
      let accessoryTotal = 0;
      for (const accessory of selectedAccessories) {
        const accessoryData = cartItem.selectedAccessories.find(acc => acc.accessoryId === accessory.accessoryId);
        if (accessoryData) {
          accessoryTotal += accessoryData.accessory.price * (accessory.quantity || 1);
        }
      }
      newTotalPrice += accessoryTotal;
    }

    // 更新购物车商品
    const updatedItem = await CartService.updateCartItem(id, {
      quantity,
      selectedAccessories
    });

    if (!updatedItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: '更新购物车商品失败'
        }
      } as ApiResponse);
    }

    logger.info('Cart item updated', { 
      userId: req.user.id, 
      cartItemId: id,
      changes: Object.keys(req.body) 
    });

    res.json({
      success: true,
      data: updatedItem
    } as ApiResponse);
  })
];

// 从购物车移除商品
export const removeFromCart = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // 验证商品是否属于当前用户
    const currentCart = await CartService.getUserCart(req.user.id);
    const cartItem = currentCart.items.find(item => item.id === id);

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CART_ITEM_NOT_FOUND',
          message: '购物车商品不存在'
        }
      } as ApiResponse);
    }

    await CartService.removeFromCart(id);

    logger.info('Item removed from cart', { 
      userId: req.user.id, 
      cartItemId: id 
    });

    res.json({
      success: true,
      data: {
        message: '商品已从购物车移除'
      }
    } as ApiResponse);
  })
];

// 清空购物车
export const clearCart = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    await CartService.clearCart(req.user.id);

    logger.info('Cart cleared', { userId: req.user.id });

    res.json({
      success: true,
      data: {
        message: '购物车已清空'
      }
    } as ApiResponse);
  })
];

// 批量添加到购物车
export const batchAddToCart = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const items = req.body.items as CartItemData[];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ITEMS',
          message: '无效的商品数据'
        }
      } as ApiResponse);
    }

    if (items.length > 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_ITEMS',
          message: '批量添加最多支持10件商品'
        }
      } as ApiResponse);
    }

    const results = {
      success: [] as any[],
      failed: [] as { item: any; error: string }[]
    };

    // 检查购物车现有商品数量
    const currentCart = await CartService.getUserCart(req.user.id);
    if (currentCart.items.length + items.length > config.business.maxCartItems) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CART_LIMIT_EXCEEDED',
          message: `购物车最多只能容纳 ${config.business.maxCartItems} 件商品`
        }
      } as ApiResponse);
    }

    for (const item of items) {
      try {
        // 验证商品
        const product = await ProductService.getProductById(item.productId);
        if (!product || !product.isActive) {
          results.failed.push({
            item,
            error: '商品不存在或已下架'
          });
          continue;
        }

        // 计算价格
        const selectedSize = product.specifications?.sizes.find(size => size.id === item.selectedSizeId);
        if (!selectedSize) {
          results.failed.push({
            item,
            error: '选择的尺寸无效'
          });
          continue;
        }

        let unitPrice = product.basePrice + selectedSize.price;
        let totalPrice = unitPrice * item.quantity;

        // 添加配件价格
        if (item.selectedAccessories) {
          for (const accessory of item.selectedAccessories) {
            totalPrice += 50; // 简化计算，实际应该从数据库获取
          }
        }

        // 添加定制价格
        if (item.customizations) {
          for (const customization of item.customizations) {
            totalPrice += customization.price;
          }
        }

        // 添加到购物车
        const cartItem = await CartService.addToCart({
          userId: req.user.id,
          productId: item.productId,
          imageId: item.imageId,
          quantity: item.quantity,
          selectedSizeId: item.selectedSizeId,
          selectedAccessories: item.selectedAccessories || [],
          customizations: item.customizations || [],
          unitPrice,
          totalPrice
        });

        results.success.push(cartItem);
      } catch (error) {
        results.failed.push({
          item,
          error: error instanceof Error ? error.message : '添加失败'
        });
      }
    }

    logger.info('Batch add to cart completed', { 
      userId: req.user.id,
      totalItems: items.length,
      successful: results.success.length,
      failed: results.failed.length
    });

    res.json({
      success: true,
      data: results,
      meta: {
        total: items.length,
        successCount: results.success.length,
        failedCount: results.failed.length
      }
    } as ApiResponse);
  })
];

// 获取购物车商品详情
export const getCartItemDetails = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const currentCart = await CartService.getUserCart(req.user.id);
    const cartItem = currentCart.items.find(item => item.id === id);

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CART_ITEM_NOT_FOUND',
          message: '购物车商品不存在'
        }
      } as ApiResponse);
    }

    // 获取商品最新信息（价格、库存等）
    const product = await ProductService.getProductById(cartItem.productId);
    
    if (product) {
      // 检查商品是否仍然激活
      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PRODUCT_INACTIVE',
            message: '商品已下架',
            data: { cartItem }
          }
        } as ApiResponse);
      }

      // 检查价格是否发生变化
      if (product.basePrice !== cartItem.product.basePrice) {
        return res.json({
          success: true,
          data: {
            ...cartItem,
            priceChanged: true,
            oldPrice: cartItem.product.basePrice,
            newPrice: product.basePrice
          },
          warning: '商品价格已发生变化，请重新确认'
        } as any);
      }
    }

    res.json({
      success: true,
      data: cartItem
    } as ApiResponse);
  })
];

// 验证购物车
export const validateCart = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const currentCart = await CartService.getUserCart(req.user.id);
    
    const validation = {
      valid: true,
      issues: [] as string[],
      items: [] as any[]
    };

    for (const item of currentCart.items) {
      const itemValidation = {
        id: item.id,
        productName: item.product.name,
        valid: true,
        issues: [] as string[]
      };

      // 检查商品是否存在
      const product = await ProductService.getProductById(item.productId);
      if (!product) {
        itemValidation.valid = false;
        itemValidation.issues.push('商品不存在');
        validation.valid = false;
      } else if (!product.isActive) {
        itemValidation.valid = false;
        itemValidation.issues.push('商品已下架');
        validation.valid = false;
      }

      // 检查尺寸是否存在
      const sizeExists = product?.specifications?.sizes.some(size => size.id === item.selectedSizeId);
      if (!sizeExists) {
        itemValidation.valid = false;
        itemValidation.issues.push('选择的尺寸不存在');
        validation.valid = false;
      }

      validation.items.push(itemValidation);
      if (itemValidation.issues.length > 0) {
        validation.issues.push(`${item.product.name}: ${itemValidation.issues.join(', ')}`);
      }
    }

    res.json({
      success: true,
      data: validation
    } as ApiResponse);
  })
];

// 获取购物车统计
export const getCartStats = [
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const cart = await CartService.getUserCart(req.user.id);

    // 按商品分类统计
    const categoryStats = {} as { [key: string]: number };
    const styleStats = {} as { [key: string]: number };
    const sizeStats = {} as { [key: string]: number };

    cart.items.forEach(item => {
      // 分类统计
      const category = item.product.category;
      categoryStats[category] = (categoryStats[category] || 0) + item.quantity;

      // 尺寸统计
      const size = item.selectedSize.name;
      sizeStats[size] = (sizeStats[size] || 0) + item.quantity;
    });

    const stats = {
      totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      totalPrice: cart.total,
      itemCount: cart.items.length,
      averageItemPrice: cart.items.length > 0 ? cart.total / cart.items.length : 0,
      categoryStats,
      sizeStats,
      hasCustomizations: cart.items.some(item => item.customizations.length > 0),
      hasAccessories: cart.items.some(item => item.selectedAccessories.length > 0)
    };

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  })
];

// 导出控制器函数
export default {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  batchAddToCart,
  getCartItemDetails,
  validateCart,
  getCartStats
};