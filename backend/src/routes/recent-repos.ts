import { Router, Request, Response } from 'express';
import { getRecentRepos } from '../services/recent-repos.service';

export function recentReposRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(getRecentRepos());
  });

  return router;
}
