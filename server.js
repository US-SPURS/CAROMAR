const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import utilities
const logger = require('./utils/logger');
const RepositoryAnalytics = require('./utils/analytics');
const RepositoryComparison = require('./utils/comparison');
const {
    isValidGitHubUsername,
    isValidRepositoryName,
    isValidGitHubToken,
    sanitizeString,
    validatePagination,
    validateSort
} = require('./utils/validation');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});

// Middleware
// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.github.com"]
        }
    }
}));

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.logResponse(req, res, duration);
    });
    next();
});

app.use('/api/', apiLimiter);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// Enhanced API endpoint to search repositories with advanced filtering
app.get('/api/search-repos', async (req, res) => {
    try {
        let { username, token, type = 'all', sort = 'updated', per_page = 100, page = 1 } = req.query;
        
        // Validate username
        username = sanitizeString(username);
        if (!username || !isValidGitHubUsername(username)) {
            logger.warn('Invalid username provided', { username });
            return res.status(400).json({ error: 'Valid username is required' });
        }

        // Validate token format if provided
        if (token && !isValidGitHubToken(token)) {
            logger.warn('Invalid token format');
            return res.status(400).json({ error: 'Invalid token format' });
        }

        // Validate pagination
        const pagination = validatePagination(page, per_page);
        page = pagination.page;
        per_page = pagination.perPage;

        // Validate sort parameter
        const allowedSorts = ['updated', 'created', 'pushed', 'full_name'];
        sort = validateSort(sort, allowedSorts);

        const headers = token ? { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        } : {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        };

        // Check if it's an organization or user
        let endpoint = `https://api.github.com/users/${username}/repos`;
        try {
            const userResponse = await axios.get(`https://api.github.com/users/${username}`, { headers });
            if (userResponse.data.type === 'Organization') {
                endpoint = `https://api.github.com/orgs/${username}/repos`;
            }
        } catch (error) {
            // Fallback to user repos if organization check fails
        }

        const response = await axios.get(endpoint, {
            headers,
            params: {
                per_page: Math.min(per_page, 100),
                page,
                sort,
                type,
                direction: 'desc'
            }
        });

        const repos = response.data.map(repo => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            clone_url: repo.clone_url,
            ssh_url: repo.ssh_url,
            html_url: repo.html_url,
            private: repo.private,
            fork: repo.fork,
            archived: repo.archived,
            disabled: repo.disabled,
            updated_at: repo.updated_at,
            created_at: repo.created_at,
            pushed_at: repo.pushed_at,
            language: repo.language,
            size: repo.size,
            stargazers_count: repo.stargazers_count,
            watchers_count: repo.watchers_count,
            forks_count: repo.forks_count,
            open_issues_count: repo.open_issues_count,
            license: repo.license,
            topics: repo.topics,
            default_branch: repo.default_branch,
            permissions: repo.permissions
        }));

        // Get rate limit info
        const rateLimitRemaining = response.headers['x-ratelimit-remaining'];
        const rateLimitReset = response.headers['x-ratelimit-reset'];

        res.json({ 
            repos,
            pagination: {
                page: parseInt(page),
                per_page: parseInt(per_page),
                total: repos.length,
                has_more: repos.length === parseInt(per_page)
            },
            rate_limit: {
                remaining: rateLimitRemaining,
                reset: rateLimitReset ? new Date(rateLimitReset * 1000) : null
            }
        });
    } catch (error) {
        logger.error('Error fetching repositories', error);
        
        if (error.response?.status === 403) {
            res.status(403).json({ 
                error: 'API rate limit exceeded or insufficient permissions',
                reset_time: error.response.headers['x-ratelimit-reset'] ? 
                    new Date(error.response.headers['x-ratelimit-reset'] * 1000) : null
            });
        } else if (error.response?.status === 404) {
            res.status(404).json({ error: 'User not found' });
        } else {
            res.status(500).json({ error: 'Failed to fetch repositories', details: error.message });
        }
    }
});

// Enhanced API endpoint to fork a repository with better error handling
app.post('/api/fork-repo', async (req, res) => {
    try {
        let { owner, repo, token, organization } = req.body;
        
        // Validate inputs
        owner = sanitizeString(owner);
        repo = sanitizeString(repo);
        
        if (!owner || !isValidGitHubUsername(owner)) {
            return res.status(400).json({ error: 'Valid owner is required' });
        }
        
        if (!repo || !isValidRepositoryName(repo)) {
            return res.status(400).json({ error: 'Valid repository name is required' });
        }
        
        if (!token || !isValidGitHubToken(token)) {
            return res.status(400).json({ error: 'Valid token is required' });
        }
        
        if (organization) {
            organization = sanitizeString(organization);
            if (!isValidGitHubUsername(organization)) {
                return res.status(400).json({ error: 'Valid organization name is required' });
            }
        }

        const forkData = organization ? { organization } : {};

        logger.info('Forking repository', { owner, repo, organization });

        const response = await axios.post(`https://api.github.com/repos/${owner}/${repo}/forks`, forkData, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'CAROMAR-App'
            }
        });

        logger.info('Repository forked successfully', { full_name: response.data.full_name });

        res.json({ 
            success: true, 
            fork_url: response.data.html_url,
            clone_url: response.data.clone_url,
            ssh_url: response.data.ssh_url,
            full_name: response.data.full_name,
            message: 'Repository forked successfully'
        });
    } catch (error) {
        logger.error('Error forking repository', error);
        
        let errorMessage = 'Failed to fork repository';
        let statusCode = 500;

        if (error.response?.status === 403) {
            errorMessage = 'Insufficient permissions or repository already forked';
            statusCode = 403;
        } else if (error.response?.status === 404) {
            errorMessage = 'Repository not found or not accessible';
            statusCode = 404;
        } else if (error.response?.status === 422) {
            errorMessage = 'Repository already exists or cannot be forked';
            statusCode = 422;
        }

        res.status(statusCode).json({ 
            error: errorMessage,
            details: error.response?.data?.message || error.message
        });
    }
});

// New API endpoint to create a merged repository
app.post('/api/create-merged-repo', async (req, res) => {
    try {
        let { name, description, repositories, token, private: isPrivate = false } = req.body;
        
        // Validate inputs
        name = sanitizeString(name);
        if (!name || !isValidRepositoryName(name)) {
            return res.status(400).json({ error: 'Valid repository name is required' });
        }
        
        if (!repositories || !Array.isArray(repositories) || repositories.length === 0) {
            return res.status(400).json({ error: 'At least one repository is required' });
        }
        
        if (repositories.length > 50) {
            return res.status(400).json({ error: 'Maximum 50 repositories can be merged at once' });
        }
        
        if (!token || !isValidGitHubToken(token)) {
            return res.status(400).json({ error: 'Valid token is required' });
        }
        
        description = sanitizeString(description);

        logger.info('Creating merged repository', { name, repoCount: repositories.length });

        // Create the new repository
        const createRepoResponse = await axios.post('https://api.github.com/user/repos', {
            name,
            description: description || `Merged repository containing: ${repositories.map(r => r.name).join(', ')}`,
            private: isPrivate,
            auto_init: true
        }, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'CAROMAR-App'
            }
        });

        const newRepo = createRepoResponse.data;

        logger.info('Merged repository created successfully', { full_name: newRepo.full_name });

        // Return the created repository info and instructions for manual merge
        // Note: Full git operations would require a more complex server setup with git installed
        res.json({
            success: true,
            repository: {
                name: newRepo.name,
                full_name: newRepo.full_name,
                html_url: newRepo.html_url,
                clone_url: newRepo.clone_url,
                ssh_url: newRepo.ssh_url
            },
            message: 'Repository created successfully',
            merge_instructions: {
                repositories: repositories,
                steps: [
                    `git clone ${newRepo.clone_url}`,
                    `cd ${newRepo.name}`,
                    ...repositories.map(repo => [
                        `mkdir ${repo.name}`,
                        `cd ${repo.name}`,
                        `git clone ${repo.clone_url} .`,
                        `rm -rf .git`,
                        `cd ..`
                    ]).flat()
                ]
            }
        });
    } catch (error) {
        logger.error('Error creating merged repository', error);
        
        if (error.response?.status === 422) {
            res.status(422).json({ 
                error: 'Repository name already exists or is invalid',
                details: error.response?.data?.message || error.message
            });
        } else if (error.response?.status === 403) {
            res.status(403).json({ 
                error: 'Insufficient permissions to create repository',
                details: error.response?.data?.message || error.message
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to create merged repository',
                details: error.response?.data?.message || error.message
            });
        }
    }
});

// API endpoint to get repository content for preview
app.get('/api/repo-content', async (req, res) => {
    try {
        let { owner, repo, path = '', token } = req.query;
        
        // Validate inputs
        owner = sanitizeString(owner);
        repo = sanitizeString(repo);
        path = sanitizeString(path);
        
        if (!owner || !isValidGitHubUsername(owner)) {
            return res.status(400).json({ error: 'Valid owner is required' });
        }
        
        if (!repo || !isValidRepositoryName(repo)) {
            return res.status(400).json({ error: 'Valid repository name is required' });
        }

        const headers = token ? {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        } : {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        };

        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            headers
        });

        res.json({ content: response.data });
    } catch (error) {
        logger.error('Error fetching repository content', error);
        res.status(error.response?.status || 500).json({ 
            error: 'Failed to fetch repository content',
            details: error.response?.data?.message || error.message
        });
    }
});

// Enhanced API endpoint to get user info with additional details
app.get('/api/user', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token || !isValidGitHubToken(token)) {
            return res.status(400).json({ error: 'Valid token is required' });
        }

        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        };

        const userResponse = await axios.get('https://api.github.com/user', { headers });
        
        // Get additional user stats
        const reposResponse = await axios.get('https://api.github.com/user/repos', { 
            headers,
            params: { per_page: 1 } 
        });

        // Get rate limit info
        const rateLimitResponse = await axios.get('https://api.github.com/rate_limit', { headers });

        res.json({
            username: userResponse.data.login,
            name: userResponse.data.name,
            email: userResponse.data.email,
            avatar_url: userResponse.data.avatar_url,
            bio: userResponse.data.bio,
            company: userResponse.data.company,
            location: userResponse.data.location,
            public_repos: userResponse.data.public_repos,
            public_gists: userResponse.data.public_gists,
            followers: userResponse.data.followers,
            following: userResponse.data.following,
            created_at: userResponse.data.created_at,
            type: userResponse.data.type,
            plan: userResponse.data.plan,
            rate_limit: rateLimitResponse.data.rate
        });
    } catch (error) {
        logger.error('Error fetching user info', error);
        
        if (error.response?.status === 401) {
            res.status(401).json({ error: 'Invalid or expired token' });
        } else if (error.response?.status === 403) {
            res.status(403).json({ error: 'Token lacks required permissions' });
        } else {
            res.status(500).json({ error: 'Failed to fetch user information' });
        }
    }
});

// API endpoint to validate token permissions
app.get('/api/validate-token', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'CAROMAR-App'
        };

        // Check token validity and permissions
        const response = await axios.get('https://api.github.com/user', { headers });
        
        // Extract scopes from headers
        const scopes = response.headers['x-oauth-scopes']?.split(', ') || [];
        
        res.json({
            valid: true,
            scopes,
            required_scopes: ['repo', 'user'],
            has_required_permissions: scopes.includes('repo') && scopes.includes('user'),
            user: {
                login: response.data.login,
                type: response.data.type
            }
        });
    } catch (error) {
        res.json({
            valid: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// API endpoint to analyze repositories
app.post('/api/analyze-repos', async (req, res) => {
    try {
        const { repositories } = req.body;
        
        if (!repositories || !Array.isArray(repositories)) {
            return res.status(400).json({ error: 'Valid repositories array is required' });
        }
        
        const analytics = new RepositoryAnalytics(repositories);
        const report = analytics.generateReport();
        
        logger.info('Repository analysis completed', { count: repositories.length });
        
        res.json({
            success: true,
            analysis: report,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error analyzing repositories', error);
        res.status(500).json({ 
            error: 'Failed to analyze repositories',
            details: error.message
        });
    }
});

// API endpoint to compare repositories
app.post('/api/compare-repos', async (req, res) => {
    try {
        const { repositories, mode = 'two' } = req.body;
        
        if (!repositories || !Array.isArray(repositories)) {
            return res.status(400).json({ error: 'Valid repositories array is required' });
        }
        
        let comparison;
        
        if (mode === 'two' && repositories.length === 2) {
            comparison = RepositoryComparison.compareTwo(repositories[0], repositories[1]);
        } else if (mode === 'multiple') {
            comparison = RepositoryComparison.compareMultiple(repositories);
        } else if (mode === 'best') {
            const criteria = req.body.criteria || 'stars';
            comparison = RepositoryComparison.findBest(repositories, criteria);
        } else {
            return res.status(400).json({ 
                error: 'Invalid comparison mode or repository count',
                details: 'Mode "two" requires exactly 2 repositories'
            });
        }
        
        logger.info('Repository comparison completed', { mode, count: repositories.length });
        
        res.json({
            success: true,
            comparison,
            mode,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error comparing repositories', error);
        res.status(500).json({ 
            error: 'Failed to compare repositories',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('./package.json').version
    });
});

// Error handling middleware for undefined routes
app.use((req, res) => {
    logger.warn('Route not found', { path: req.path, method: req.method });
    res.status(404).json({ error: 'Route not found' });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

app.listen(PORT, () => {
    logger.info(`CAROMAR server is running on http://localhost:${PORT}`);
});