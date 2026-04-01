import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as path from 'path';
import { GitService } from './services/git.service';
import { branchRoutes } from './routes/branches';
import { commitRoutes } from './routes/commits';
import { statusRoutes } from './routes/status';
import { fileRoutes } from './routes/files';
import { repoRoutes } from './routes/repo';
import { browseRoutes } from './routes/browse';
import { recentReposRoutes } from './routes/recent-repos';
import { errorHandler } from './middleware/error';

const initialRepoPath = process.env.GIT_REPO_PATH
  ? path.resolve(process.env.GIT_REPO_PATH)
  : null;

const port = parseInt(process.env.PORT || '3000', 10);

// Mutable reference so /api/repo can swap in a new GitService at runtime.
// Starts null when no GIT_REPO_PATH is set — landing page handles selection.
let git: GitService | null = initialRepoPath ? new GitService(initialRepoPath) : null;
const getGit = () => git;
const setGit = (g: GitService) => { git = g; };

const app = express();
app.use(cors());
app.use(express.json());

// Guard: routes that require an active repo return 503 until one is selected
const requireRepo = (_req: Request, res: Response, next: NextFunction) => {
  if (!git) {
    res.status(503).json({ error: 'No repository selected' });
    return;
  }
  next();
};

// Inject current git instance per-request so repo switches take effect immediately
app.use('/api/branches', requireRepo, (req: Request, res: Response, next: NextFunction) => branchRoutes(git!)(req, res, next));
app.use('/api/commits',  requireRepo, (req: Request, res: Response, next: NextFunction) => commitRoutes(git!)(req, res, next));
app.use('/api/status',   requireRepo, (req: Request, res: Response, next: NextFunction) => statusRoutes(git!)(req, res, next));
app.use('/api/files',    requireRepo, (req: Request, res: Response, next: NextFunction) => fileRoutes(git!)(req, res, next));
app.use('/api/repo',     repoRoutes(getGit, setGit));
app.use('/api/browse',   browseRoutes());
app.use('/api/recent-repos', recentReposRoutes());

// In production, serve the Angular frontend
const frontendPath = path.resolve(__dirname, '../../frontend/dist/frontend');
app.use(express.static(frontendPath));
app.get('*', (_req: Request, res: Response, next: NextFunction) => {
  if (_req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Git Viewer API running on http://localhost:${port}`);
  if (initialRepoPath) {
    console.log(`Watching repository: ${initialRepoPath}`);
  } else {
    console.log('No repository selected — waiting for user selection');
  }
});
