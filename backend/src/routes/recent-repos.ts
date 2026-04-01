import { Router, Request, Response } from 'express';
import { getRecentRepos, removeRecentRepo } from '../services/recent-repos.service';

export function recentReposRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    res.json(getRecentRepos());
  });

  router.delete('/', (req: Request, res: Response) => {
    const { path } = req.body as { path: string };
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'path is required' });
      return;
    }
    removeRecentRepo(path);
    res.status(204).send();
  });

  return router;
}
