import { Router } from 'express';
import { GitService } from '../services/git.service';

export function branchRoutes(git: GitService): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      res.json(await git.getBranches());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
