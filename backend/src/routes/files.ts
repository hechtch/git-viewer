import { Router } from 'express';
import { GitService } from '../services/git.service';

export function fileRoutes(git: GitService): Router {
  const router = Router();

  // GET /api/files/:ref — list all files at a ref
  router.get('/:ref', async (req, res, next) => {
    try {
      res.json(await git.getFileTree(req.params.ref));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files/:ref/path/to/file — get file content at a ref
  router.get('/:ref/*', async (req, res, next) => {
    try {
      const filePath = (req.params as any)[0];
      const content = await git.getFileContent(req.params.ref, filePath);
      res.type('text/plain').send(content);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
