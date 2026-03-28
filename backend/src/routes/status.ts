import { Router } from 'express';
import { GitService } from '../services/git.service';

export function statusRoutes(git: GitService): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await git.getStatus());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
