import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { parseProductUrlController } from './product-url.controller.js';
import { parseProductUrlDto } from './product-url.dto.js';

export const productUrlRouter = Router();

productUrlRouter.use(requireAuth);
productUrlRouter.post('/parse', validate(parseProductUrlDto), parseProductUrlController);
