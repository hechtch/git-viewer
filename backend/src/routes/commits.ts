import { Router } from 'express';
import { GitService } from '../services/git.service';

export function commitRoutes(git: GitService): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const branch = req.query.branch as string | undefined;
      const all = req.query.all === 'true';
      const limit = parseInt(req.query.limit as string, 10) || 50;
      res.json(await git.getCommits({ branch, all, limit }));
    } catch (err) {
      next(err);
    }
  });

  router.get('/graph', async (_req, res, next) => {
    try {
      res.json(await git.getGraph());
    } catch (err) {
      next(err);
    }
  });

  router.get('/:sha', async (req, res, next) => {
    try {
      res.json(await git.getCommitDetail(req.params.sha));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
