import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

// 启动微信授权
export const startWeChatAuth = (req: Request, res: Response) => {
  const authorizeUrl = process.env.WECHAT_OAUTH_AUTHORIZE_URL;
  if (!authorizeUrl) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: '未配置微信授权地址，请设置环境变量 WECHAT_OAUTH_AUTHORIZE_URL'
      }
    };
    return res.status(501).json(response);
  }

  logger.info('Redirecting to WeChat OAuth authorize URL');
  return res.redirect(authorizeUrl);
};

// 启动QQ授权
export const startQQAuth = (req: Request, res: Response) => {
  const authorizeUrl = process.env.QQ_OAUTH_AUTHORIZE_URL;
  if (!authorizeUrl) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_CONFIGURED',
        message: '未配置QQ授权地址，请设置环境变量 QQ_OAUTH_AUTHORIZE_URL'
      }
    };
    return res.status(501).json(response);
  }

  logger.info('Redirecting to QQ OAuth authorize URL');
  return res.redirect(authorizeUrl);
};

// 回调占位（后续实现凭证交换与登录）
export const oauthCallback = (req: Request, res: Response) => {
  const { provider } = req.params as { provider: 'wechat' | 'qq' };
  const { code, state } = req.query as { code?: string; state?: string };

  logger.info('OAuth callback received', { provider, code, state });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `暂未实现${provider}回调处理。收到参数 code=${code || ''}, state=${state || ''}`
    }
  };

  return res.status(501).json(response);
};