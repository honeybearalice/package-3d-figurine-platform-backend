import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { config } from '../config'
import { authenticateToken } from '../middleware/auth'
import { logger } from '../utils/logger'
import { uploadSingle as uploadS3Single } from '../middleware/upload'

const router = Router()

const uploadDir = path.join(__dirname, '..', '..', 'uploads')
const ensureLocal = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }
}

const allowed = new Set(config.upload.allowedTypes)
const localStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureLocal()
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
    cb(null, name)
  }
})

const uploadLocal = multer({
  storage: localStorage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (_req, file, cb) => {
    if (allowed.has(file.mimetype)) cb(null, true)
    else cb(new Error('不支持的文件类型'))
  }
})

export const uploadImage = [
  authenticateToken,
  // 如果配置了AWS凭据则走S3，否则走本地磁盘
  ...(config.aws.accessKeyId && config.aws.secretAccessKey && config.aws.bucketName
    ? [uploadS3Single]
    : [uploadLocal.single('file')]
  ),
  (req: any, res: any) => {
    const file = (req.file || (req.files && req.files['file'] && req.files['file'][0]))
    if (!file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: '未接收到文件' } })
    }

    let url = ''
    if (file.location) {
      // S3 返回的公开地址
      url = file.location
    } else if (file.key && config.aws.bucketName && config.aws.region) {
      const domain = config.aws.region?.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com'
      url = `https://${config.aws.bucketName}.s3.${config.aws.region}.${domain}/${file.key}`
    } else if (file.filename) {
      url = `${config.apiUrl.replace(/\/$/, '')}/uploads/${file.filename}`
    }

    logger.info('Image uploaded', { userId: req.user?.id, url })
    res.json({ success: true, data: { url } })
  }
]

export default router