import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { createNotImplementedController } from './onboarding.controller.js';
import { upsertOnboardingDto } from './onboarding.dto.js';

export const onboardingRouter = Router();
const todo = createNotImplementedController('onboarding');

onboardingRouter.use(requireAuth);
onboardingRouter.get('/', todo);
onboardingRouter.put('/', validate(upsertOnboardingDto), todo);
