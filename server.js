const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

// API endpoint to search repositories
app.get('/api/search-repos', async (req, res) => {
    try {
        const { username, token } = req.query;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const headers = token ? { 
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
        } : {
            'Accept': 'application/vnd.github.v3+json'
        };

        const response = await axios.get(`https://api.github.com/users/${username}/repos`, {
            headers,
            params: {
                per_page: 100,
                sort: 'updated'
            }
        });

        const repos = response.data.map(repo => ({
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            clone_url: repo.clone_url,
            html_url: repo.html_url,
            private: repo.private,
            fork: repo.fork,
            updated_at: repo.updated_at,
            language: repo.language
        }));

        res.json({ repos });
    } catch (error) {
        console.error('Error fetching repositories:', error.message);
        res.status(500).json({ error: 'Failed to fetch repositories' });
    }
});

// API endpoint to fork a repository
app.post('/api/fork-repo', async (req, res) => {
    try {
        const { owner, repo, token } = req.body;
        
        if (!owner || !repo || !token) {
            return res.status(400).json({ error: 'Owner, repo, and token are required' });
        }

        const response = await axios.post(`https://api.github.com/repos/${owner}/${repo}/forks`, {}, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        res.json({ 
            success: true, 
            fork_url: response.data.html_url,
            message: 'Repository forked successfully'
        });
    } catch (error) {
        console.error('Error forking repository:', error.message);
        res.status(500).json({ 
            error: 'Failed to fork repository',
            details: error.response?.data?.message || error.message
        });
    }
});

// API endpoint to get user info
app.get('/api/user', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const response = await axios.get('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        res.json({
            username: response.data.login,
            name: response.data.name,
            avatar_url: response.data.avatar_url
        });
    } catch (error) {
        console.error('Error fetching user info:', error.message);
        res.status(401).json({ error: 'Invalid token or failed to fetch user info' });
    }
});

app.listen(PORT, () => {
    console.log(`CAROMAR server is running on http://localhost:${PORT}`);
});