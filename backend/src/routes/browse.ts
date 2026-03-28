import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface BrowseEntry {
  name: string;
  type: 'dir' | 'file';
  isGitRepo: boolean;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export function browseRoutes(): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestedPath = (req.query.path as string) || process.env.HOME || '/';
      const resolved = path.resolve(requestedPath);

      const stat = await fs.promises.stat(resolved);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: 'Not a directory' });
        return;
      }

      const names = await fs.promises.readdir(resolved);
      const entries: BrowseEntry[] = [];

      for (const name of names) {
        if (name.startsWith('.')) continue; // hide dotfiles
        const full = path.join(resolved, name);
        try {
          const s = await fs.promises.stat(full);
          if (!s.isDirectory()) continue;
          const isGitRepo = await isGit(full);
          entries.push({ name, type: 'dir', isGitRepo });
        } catch {
          // skip unreadable entries
        }
      }

      entries.sort((a, b) => {
        if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const parent = resolved !== path.parse(resolved).root
        ? path.dirname(resolved)
        : null;

      res.json({ path: resolved, parent, entries } as BrowseResponse);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/browse/pick — open a native OS folder picker dialog
  router.post('/pick', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const startPath = (req.body?.path as string) || process.env.HOME || '/';
      const { stdout } = await execFileAsync('zenity', [
        '--file-selection',
        '--directory',
        '--title=Select a git repository',
        `--filename=${startPath}/`,
      ], { env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' } });

      const selected = stdout.trim();
      if (!selected) {
        res.status(204).end(); // user cancelled
        return;
      }
      res.json({ path: selected });
    } catch (err: any) {
      // zenity exits with code 1 on Cancel — that's not an error
      if (err.code === 1) {
        res.status(204).end();
      } else {
        next(err);
      }
    }
  });

  return router;
}

async function isGit(dirPath: string): Promise<boolean> {
  try {
    await fs.promises.stat(path.join(dirPath, '.git'));
    return true;
  } catch {
    return false;
  }
}
