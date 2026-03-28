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
import { errorHandler } from './middleware/error';

const initialRepoPath = process.env.GIT_REPO_PATH || path.resolve(__dirname, '../../../sample-project');
const port = parseInt(process.env.PORT || '3000', 10);

// Mutable reference so /api/repo can swap in a new GitService at runtime
let git = new GitService(initialRepoPath);
const getGit = () => git;
const setGit = (g: GitService) => { git = g; };

const app = express();
app.use(cors());
app.use(express.json());

// Inject current git instance per-request so repo switches take effect immediately
app.use('/api/branches', (req: Request, res: Response, next: NextFunction) => branchRoutes(getGit())(req, res, next));
app.use('/api/commits',  (req: Request, res: Response, next: NextFunction) => commitRoutes(getGit())(req, res, next));
app.use('/api/status',   (req: Request, res: Response, next: NextFunction) => statusRoutes(getGit())(req, res, next));
app.use('/api/files',    (req: Request, res: Response, next: NextFunction) => fileRoutes(getGit())(req, res, next));
app.use('/api/repo',     repoRoutes(getGit, setGit));
app.use('/api/browse',  browseRoutes());

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
  console.log(`Watching repository: ${initialRepoPath}`);
});
