import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { getOnboardingController, updateOnboardingController } from './onboarding.controller.js';
import { upsertOnboardingDto } from './onboarding.dto.js';

export const onboardingRouter = Router();

onboardingRouter.use(requireAuth);
onboardingRouter.get('/', getOnboardingController);
onboardingRouter.put('/', validate(upsertOnboardingDto), updateOnboardingController);
