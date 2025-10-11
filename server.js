const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
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
        const { username, token, type = 'all', sort = 'updated', per_page = 100, page = 1 } = req.query;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

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
        console.error('Error fetching repositories:', error.message);
        
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
        const { owner, repo, token, organization } = req.body;
        
        if (!owner || !repo || !token) {
            return res.status(400).json({ error: 'Owner, repo, and token are required' });
        }

        const forkData = organization ? { organization } : {};

        const response = await axios.post(`https://api.github.com/repos/${owner}/${repo}/forks`, forkData, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'CAROMAR-App'
            }
        });

        res.json({ 
            success: true, 
            fork_url: response.data.html_url,
            clone_url: response.data.clone_url,
            ssh_url: response.data.ssh_url,
            full_name: response.data.full_name,
            message: 'Repository forked successfully'
        });
    } catch (error) {
        console.error('Error forking repository:', error.message);
        
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
        const { name, description, repositories, token, private: isPrivate = false } = req.body;
        
        if (!name || !repositories || !Array.isArray(repositories) || repositories.length === 0 || !token) {
            return res.status(400).json({ error: 'Name, repositories array, and token are required' });
        }

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
        console.error('Error creating merged repository:', error.message);
        
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
        const { owner, repo, path = '', token } = req.query;
        
        if (!owner || !repo) {
            return res.status(400).json({ error: 'Owner and repo are required' });
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
        console.error('Error fetching repository content:', error.message);
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
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
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
        console.error('Error fetching user info:', error.message);
        
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

app.listen(PORT, () => {
    console.log(`CAROMAR server is running on http://localhost:${PORT}`);
});