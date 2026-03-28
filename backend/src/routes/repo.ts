import { Router, Request, Response, NextFunction } from 'express';
import * as path from 'path';
import { GitService } from '../services/git.service';

export function repoRoutes(
  getGit: () => GitService,
  setGit: (git: GitService) => void
): Router {
  const router = Router();

  // GET /api/repo — return current repo path
  router.get('/', (req: Request, res: Response) => {
    res.json({ path: getGit()['repoPath'] });
  });

  // POST /api/repo — set a new repo path
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    const { path: repoPath } = req.body as { path: string };
    if (!repoPath || typeof repoPath !== 'string') {
      res.status(400).json({ error: 'path is required' });
      return;
    }

    const resolved = path.resolve(repoPath);
    const candidate = new GitService(resolved);
    const valid = await candidate.isValidRepo();
    if (!valid) {
      res.status(422).json({ error: `Not a git repository: ${resolved}` });
      return;
    }

    setGit(candidate);
    res.json({ path: resolved });
  });

  return router;
}
