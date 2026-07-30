import { Router } from 'express';
import { authRouter } from '../features/auth/auth.routes.js';
import { consumptionRecordsRouter } from '../features/consumption-records/consumption-records.routes.js';
import { homeRouter } from '../features/home/home.routes.js';
import {
  interventionQuestionsRouter,
  interventionsRouter,
} from '../features/interventions/interventions.routes.js';
import { notificationsRouter } from '../features/notifications/notifications.routes.js';
import { onboardingRouter } from '../features/onboarding/onboarding.routes.js';
import { productUrlRouter } from '../features/product-url/product-url.routes.js';
import { reportsRouter } from '../features/reports/reports.routes.js';
import { temptationsRouter } from '../features/temptations/temptations.routes.js';
import { usersRouter } from '../features/users/users.routes.js';
import { wishlistItemsRouter } from '../features/wishlist-items/wishlist-items.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/onboarding', onboardingRouter);
apiRouter.use('/home', homeRouter);
apiRouter.use('/consumption-records', consumptionRecordsRouter);
apiRouter.use('/intervention-questions', interventionQuestionsRouter);
apiRouter.use('/interventions', interventionsRouter);
apiRouter.use('/product-url', productUrlRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/wishlist-items', wishlistItemsRouter);
apiRouter.use('/temptations', temptationsRouter);
