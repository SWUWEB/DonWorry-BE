import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './product-url.controller.js';
import { parseProductUrlDto } from './product-url.dto.js';

export const productUrlRouter = Router();
const todo = createNotImplementedController('product URL parser');

productUrlRouter.use(requireAuth);
productUrlRouter.post('/parse', validate(parseProductUrlDto), todo);
