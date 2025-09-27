class EnhancedCaromarApp {
    constructor() {
        this.githubToken = null;
        this.selectedRepos = new Set();
        this.repositories = [];
        this.filteredRepositories = [];
        this.currentUser = null;
        this.languages = new Set();
        this.searchHistory = JSON.parse(localStorage.getItem('search_history') || '[]');
        this.rateLimitInfo = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadStoredToken();
        this.setupAdvancedFeatures();
    }

    bindEvents() {
        // Token validation
        document.getElementById('validate-token').addEventListener('click', () => {
            this.validateToken();
        });

        // Repository search
        document.getElementById('search-repos').addEventListener('click', () => {
            this.searchRepositories();
        });

        // Enter key support
        document.getElementById('github-token').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.validateToken();
        });

        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchRepositories();
        });

        // Advanced filter controls
        document.getElementById('repo-type').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('repo-sort').addEventListener('change', () => {
            this.applySorting();
        });

        document.getElementById('language-filter').addEventListener('change', () => {
            this.applyFilters();
        });

        document.getElementById('repo-search').addEventListener('input', (e) => {
            this.filterRepositories(e.target.value);
        });

        // Selection controls
        document.getElementById('select-all').addEventListener('click', () => {
            this.selectAllRepos(true);
        });

        document.getElementById('deselect-all').addEventListener('click', () => {
            this.selectAllRepos(false);
        });

        // Bulk actions
        document.getElementById('preview-selected').addEventListener('click', () => {
            this.previewSelected();
        });

        document.getElementById('export-list').addEventListener('click', () => {
            this.exportRepositoryList();
        });

        document.getElementById('import-list').addEventListener('click', () => {
            this.importRepositoryList();
        });

        document.getElementById('clear-filters').addEventListener('click', () => {
            this.clearAllFilters();
        });

        // Operation mode change
        document.querySelectorAll('input[name="operation"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.handleOperationChange();
            });
        });

        // Merge options
        document.getElementById('check-repo-name').addEventListener('click', () => {
            this.checkRepositoryNameAvailability();
        });

        document.getElementById('merged-repo-name').addEventListener('input', () => {
            this.updateMergePreview();
        });

        // Execute action
        document.getElementById('execute-action').addEventListener('click', () => {
            this.executeAction();
        });
    }

    setupAdvancedFeatures() {
        // Setup keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'a':
                        e.preventDefault();
                        this.selectAllRepos(true);
                        break;
                    case 'd':
                        e.preventDefault();
                        this.selectAllRepos(false);
                        break;
                    case 'f':
                        e.preventDefault();
                        document.getElementById('repo-search').focus();
                        break;
                }
            }
        });

        // Auto-save selections
        setInterval(() => {
            this.autoSaveSelections();
        }, 30000);
    }

    loadStoredToken() {
        const storedToken = localStorage.getItem('github_token');
        if (storedToken) {
            document.getElementById('github-token').value = storedToken;
            this.validateToken();
        }
    }

    async validateToken() {
        const tokenInput = document.getElementById('github-token');
        const validateBtn = document.getElementById('validate-token');
        const token = tokenInput.value.trim();

        if (!token) {
            this.showError('Please enter a GitHub Personal Access Token');
            return;
        }

        validateBtn.innerHTML = '<div class="loading"></div> Validating...';
        validateBtn.disabled = true;

        try {
            // First validate token permissions
            const permissionResponse = await fetch(`/api/validate-token?token=${encodeURIComponent(token)}`);
            const permissionData = await permissionResponse.json();

            if (!permissionData.valid) {
                throw new Error(permissionData.error || 'Invalid token');
            }

            if (!permissionData.has_required_permissions) {
                this.showWarning('Token has limited permissions. Some features may not work properly.');
            }

            // Get full user info
            const response = await fetch(`/api/user?token=${encodeURIComponent(token)}`);
            const data = await response.json();

            if (response.ok) {
                this.githubToken = token;
                this.currentUser = data;
                this.rateLimitInfo = data.rate_limit;
                localStorage.setItem('github_token', token);
                
                // Show enhanced user info
                this.displayUserInfo(data);
                document.getElementById('repo-section').style.display = 'block';
                
                // Pre-fill username with current user
                document.getElementById('username-input').value = data.username;
                
                this.showSuccess('Token validated successfully!');
                this.updateRateLimitDisplay();
            } else {
                throw new Error(data.error || 'Invalid token');
            }
        } catch (error) {
            this.showError(`Token validation failed: ${error.message}`);
        } finally {
            validateBtn.innerHTML = '<i class="fas fa-check"></i> Validate Token';
            validateBtn.disabled = false;
        }
    }

    displayUserInfo(data) {
        document.getElementById('user-avatar').src = data.avatar_url;
        document.getElementById('user-name').textContent = data.name || data.username;
        
        const userUsername = document.getElementById('user-username');
        userUsername.innerHTML = `
            @${data.username} 
            ${data.type === 'Organization' ? '<span class="org-badge">ORG</span>' : ''}
            <br>
            <small>${data.public_repos} repos • ${data.followers} followers</small>
        `;
        
        document.getElementById('user-info').style.display = 'flex';
    }

    updateRateLimitDisplay() {
        if (!this.rateLimitInfo) return;
        
        const rateLimitElement = document.getElementById('rate-limit-info');
        const remaining = this.rateLimitInfo.remaining;
        const total = this.rateLimitInfo.limit;
        const resetTime = new Date(this.rateLimitInfo.reset * 1000);
        
        rateLimitElement.innerHTML = `
            Rate limit: ${remaining}/${total} remaining 
            (resets ${resetTime.toLocaleTimeString()})
        `;
        
        if (remaining < 100) {
            rateLimitElement.className = 'rate-limit-warning';
        }
    }

    async searchRepositories() {
        const usernameInput = document.getElementById('username-input');
        const searchBtn = document.getElementById('search-repos');
        const username = usernameInput.value.trim();

        if (!username) {
            this.showError('Please enter a GitHub username');
            return;
        }

        if (!this.githubToken) {
            this.showError('Please validate your GitHub token first');
            return;
        }

        // Add to search history
        if (!this.searchHistory.includes(username)) {
            this.searchHistory.unshift(username);
            this.searchHistory = this.searchHistory.slice(0, 10); // Keep last 10
            localStorage.setItem('search_history', JSON.stringify(this.searchHistory));
        }

        searchBtn.innerHTML = '<div class="loading"></div> Searching...';
        searchBtn.disabled = true;

        // Show skeleton loading
        this.showSkeletonLoader();

        try {
            const repoType = document.getElementById('repo-type').value;
            const sortBy = document.getElementById('repo-sort').value;

            const response = await fetch(`/api/search-repos?username=${encodeURIComponent(username)}&token=${encodeURIComponent(this.githubToken)}&type=${repoType}&sort=${sortBy}`);
            const data = await response.json();

            if (response.ok) {
                this.repositories = data.repos;
                this.filteredRepositories = [...this.repositories];
                this.extractLanguages();
                this.populateLanguageFilter();
                this.renderRepositories();
                this.updateSearchStats(data);
                
                document.getElementById('repos-list-section').style.display = 'block';
                this.showSuccess(`Found ${data.repos.length} repositories for ${username}`);
                
                // Update rate limit info
                if (data.rate_limit) {
                    this.rateLimitInfo = data.rate_limit;
                    this.updateRateLimitDisplay();
                }
            } else {
                throw new Error(data.error || 'Failed to fetch repositories');
            }
        } catch (error) {
            this.showError(`Repository search failed: ${error.message}`);
        } finally {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Search Repositories';
            searchBtn.disabled = false;
            this.hideSkeletonLoader();
        }
    }

    showSkeletonLoader() {
        const container = document.getElementById('repos-list');
        container.innerHTML = '';
        
        for (let i = 0; i < 6; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'repo-skeleton skeleton';
            container.appendChild(skeleton);
        }
    }

    hideSkeletonLoader() {
        const skeletons = document.querySelectorAll('.repo-skeleton');
        skeletons.forEach(skeleton => skeleton.remove());
    }

    extractLanguages() {
        this.languages.clear();
        this.repositories.forEach(repo => {
            if (repo.language) {
                this.languages.add(repo.language);
            }
        });
    }

    populateLanguageFilter() {
        const languageFilter = document.getElementById('language-filter');
        languageFilter.innerHTML = '<option value="">All Languages</option>';
        
        Array.from(this.languages).sort().forEach(language => {
            const option = document.createElement('option');
            option.value = language;
            option.textContent = language;
            languageFilter.appendChild(option);
        });
    }

    updateSearchStats(data) {
        const statsElement = document.getElementById('search-stats');
        const repoCount = document.getElementById('repo-count');
        
        repoCount.textContent = `${data.repos.length} repositories found`;
        statsElement.style.display = 'flex';
    }

    renderRepositories() {
        const container = document.getElementById('repos-list');
        container.innerHTML = '';

        this.filteredRepositories.forEach(repo => {
            const repoElement = this.createEnhancedRepositoryElement(repo);
            container.appendChild(repoElement);
        });

        this.updateActionButton();
    }

    createEnhancedRepositoryElement(repo) {
        const div = document.createElement('div');
        div.className = `repo-item ${repo.private ? 'private' : ''} ${repo.archived ? 'archived' : ''}`;
        div.dataset.repoId = repo.id;

        const languageDot = repo.language ? 
            `<div class="language-dot" style="background-color: ${this.getLanguageColor(repo.language)}"></div>` : 
            '';

        const topics = repo.topics && repo.topics.length > 0 ? 
            `<div class="repo-topics">
                ${repo.topics.slice(0, 3).map(topic => `<span class="topic-tag">${topic}</span>`).join('')}
                ${repo.topics.length > 3 ? `<span class="topic-tag">+${repo.topics.length - 3}</span>` : ''}
            </div>` : '';

        const formatSize = (bytes) => {
            if (bytes < 1024) return `${bytes} KB`;
            return `${(bytes / 1024).toFixed(1)} MB`;
        };

        div.innerHTML = `
            <div class="repo-header">
                <h3 class="repo-name">
                    ${repo.name}
                    ${repo.private ? '<i class="fas fa-lock" title="Private"></i>' : ''}
                    ${repo.fork ? '<i class="fas fa-code-branch" title="Fork"></i>' : ''}
                    ${repo.archived ? '<i class="fas fa-archive" title="Archived"></i>' : ''}
                </h3>
                <input type="checkbox" class="repo-checkbox" data-repo-id="${repo.id}">
            </div>
            <p class="repo-description">${repo.description || 'No description available'}</p>
            ${topics}
            <div class="repo-meta">
                ${repo.language ? `
                    <span class="repo-language">
                        ${languageDot}
                        ${repo.language}
                    </span>
                ` : ''}
                <span class="repo-stats">
                    <span><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                    <span><i class="fas fa-code-branch"></i> ${repo.forks_count}</span>
                    <span><i class="fas fa-eye"></i> ${repo.watchers_count}</span>
                    <span class="repo-size">${formatSize(repo.size)}</span>
                </span>
            </div>
            <div class="repo-stats">
                <span><i class="fas fa-clock"></i> Updated ${this.formatDate(repo.updated_at)}</span>
                ${repo.license ? `<span><i class="fas fa-balance-scale"></i> ${repo.license.name}</span>` : ''}
            </div>
        `;

        const checkbox = div.querySelector('.repo-checkbox');
        
        div.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' && !e.target.closest('a')) {
                checkbox.checked = !checkbox.checked;
                this.handleRepoSelection(checkbox);
            }
        });

        checkbox.addEventListener('change', () => {
            this.handleRepoSelection(checkbox);
        });

        return div;
    }

    handleRepoSelection(checkbox) {
        const repoId = checkbox.dataset.repoId;
        const repoElement = checkbox.closest('.repo-item');

        if (checkbox.checked) {
            this.selectedRepos.add(repoId);
            repoElement.classList.add('selected');
        } else {
            this.selectedRepos.delete(repoId);
            repoElement.classList.remove('selected');
        }

        this.updateActionButton();
        this.updateMergePreview();
    }

    applyFilters() {
        const repoType = document.getElementById('repo-type').value;
        const languageFilter = document.getElementById('language-filter').value;

        this.filteredRepositories = this.repositories.filter(repo => {
            // Type filter
            if (repoType !== 'all') {
                switch(repoType) {
                    case 'public':
                        if (repo.private) return false;
                        break;
                    case 'private':
                        if (!repo.private) return false;
                        break;
                    case 'owner':
                        if (repo.fork) return false;
                        break;
                }
            }

            // Language filter
            if (languageFilter && repo.language !== languageFilter) {
                return false;
            }

            return true;
        });

        this.applySorting();
    }

    applySorting() {
        const sortBy = document.getElementById('repo-sort').value;
        
        this.filteredRepositories.sort((a, b) => {
            switch(sortBy) {
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'created':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'updated':
                    return new Date(b.updated_at) - new Date(a.updated_at);
                case 'pushed':
                    return new Date(b.pushed_at) - new Date(a.pushed_at);
                case 'stars':
                    return b.stargazers_count - a.stargazers_count;
                case 'size':
                    return b.size - a.size;
                default:
                    return 0;
            }
        });

        this.renderRepositories();
    }

    filterRepositories(searchTerm) {
        const term = searchTerm.toLowerCase();
        const repoItems = document.querySelectorAll('.repo-item');
        
        repoItems.forEach(item => {
            const repoName = item.querySelector('.repo-name').textContent.toLowerCase();
            const repoDesc = item.querySelector('.repo-description').textContent.toLowerCase();
            
            if (repoName.includes(term) || repoDesc.includes(term)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    clearAllFilters() {
        document.getElementById('repo-type').value = 'all';
        document.getElementById('language-filter').value = '';
        document.getElementById('repo-search').value = '';
        
        this.filteredRepositories = [...this.repositories];
        this.renderRepositories();
    }

    selectAllRepos(select) {
        const visibleCheckboxes = document.querySelectorAll('.repo-item:not([style*="display: none"]) .repo-checkbox');
        visibleCheckboxes.forEach(checkbox => {
            checkbox.checked = select;
            this.handleRepoSelection(checkbox);
        });
    }

    previewSelected() {
        const selectedRepos = this.repositories.filter(repo => 
            this.selectedRepos.has(repo.id.toString())
        );

        if (selectedRepos.length === 0) {
            this.showError('No repositories selected for preview');
            return;
        }

        const previewWindow = window.open('', '_blank', 'width=800,height=600');
        previewWindow.document.write(`
            <html>
                <head>
                    <title>Selected Repositories Preview</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; }
                        .repo { border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px; }
                        .repo-name { color: #0969da; font-weight: bold; }
                        .repo-meta { color: #666; font-size: 14px; margin-top: 10px; }
                    </style>
                </head>
                <body>
                    <h1>Selected Repositories (${selectedRepos.length})</h1>
                    ${selectedRepos.map(repo => `
                        <div class="repo">
                            <div class="repo-name">${repo.name}</div>
                            <div class="repo-description">${repo.description || 'No description'}</div>
                            <div class="repo-meta">
                                ${repo.language || 'No language'} • 
                                ⭐ ${repo.stargazers_count} • 
                                🍴 ${repo.forks_count} •
                                Updated ${this.formatDate(repo.updated_at)}
                            </div>
                        </div>
                    `).join('')}
                </body>
            </html>
        `);
    }

    exportRepositoryList() {
        const selectedRepos = this.repositories.filter(repo => 
            this.selectedRepos.has(repo.id.toString())
        );

        if (selectedRepos.length === 0) {
            this.showError('No repositories selected for export');
            return;
        }

        const exportData = {
            exported_at: new Date().toISOString(),
            repositories: selectedRepos.map(repo => ({
                name: repo.name,
                full_name: repo.full_name,
                clone_url: repo.clone_url,
                html_url: repo.html_url,
                description: repo.description,
                language: repo.language,
                stars: repo.stargazers_count,
                forks: repo.forks_count
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `caromar-repositories-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.showSuccess(`Exported ${selectedRepos.length} repositories`);
    }

    importRepositoryList() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.repositories && Array.isArray(data.repositories)) {
                        // Clear current selection
                        this.selectedRepos.clear();
                        
                        // Select imported repositories
                        data.repositories.forEach(importedRepo => {
                            const repo = this.repositories.find(r => 
                                r.full_name === importedRepo.full_name || 
                                r.name === importedRepo.name
                            );
                            if (repo) {
                                this.selectedRepos.add(repo.id.toString());
                            }
                        });

                        this.renderRepositories();
                        this.showSuccess(`Imported selection for ${data.repositories.length} repositories`);
                    } else {
                        throw new Error('Invalid file format');
                    }
                } catch (error) {
                    this.showError(`Failed to import: ${error.message}`);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    handleOperationChange() {
        const mergeMode = document.querySelector('input[name="operation"]:checked').value === 'merge';
        const mergeOptions = document.getElementById('merge-options');
        mergeOptions.style.display = mergeMode ? 'block' : 'none';

        // Update radio label styling
        document.querySelectorAll('.radio-group label').forEach(label => {
            label.classList.remove('selected');
            if (label.querySelector('input').checked) {
                label.classList.add('selected');
            }
        });

        this.updateActionButton();
        if (mergeMode) {
            this.updateMergePreview();
        }
    }

    updateMergePreview() {
        const mergePreview = document.getElementById('merge-preview');
        const mergeStructure = document.getElementById('merge-structure');
        const selectedRepos = this.repositories.filter(repo => 
            this.selectedRepos.has(repo.id.toString())
        );

        if (selectedRepos.length > 0) {
            mergePreview.style.display = 'block';
            const repoName = document.getElementById('merged-repo-name').value || 'merged-repository';
            
            mergeStructure.innerHTML = `
                <div class="merge-tree">
                    <div class="folder-icon">📁 ${repoName}/</div>
                    ${selectedRepos.map(repo => `
                        <div class="repo-folder">
                            <div class="folder-icon">📁 ${repo.name}/</div>
                            <div class="folder-content">
                                ${repo.language ? `• ${repo.language} files` : ''}
                                ${repo.description ? `• ${repo.description.substring(0, 50)}...` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            mergePreview.style.display = 'none';
        }
    }

    async checkRepositoryNameAvailability() {
        const repoName = document.getElementById('merged-repo-name').value.trim();
        const checkBtn = document.getElementById('check-repo-name');

        if (!repoName) {
            this.showError('Please enter a repository name');
            return;
        }

        checkBtn.innerHTML = '<div class="loading"></div> Checking...';
        checkBtn.disabled = true;

        try {
            const response = await fetch(`https://api.github.com/repos/${this.currentUser.username}/${repoName}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 404) {
                this.showSuccess('Repository name is available!');
            } else {
                this.showWarning('Repository name already exists');
            }
        } catch (error) {
            this.showError('Failed to check repository availability');
        } finally {
            checkBtn.innerHTML = '<i class="fas fa-check"></i> Check Availability';
            checkBtn.disabled = false;
        }
    }

    updateActionButton() {
        const executeBtn = document.getElementById('execute-action');
        const selectedCount = this.selectedRepos.size;
        const operation = document.querySelector('input[name="operation"]:checked').value;

        executeBtn.disabled = selectedCount === 0;

        if (selectedCount > 0) {
            const action = operation === 'fork' ? 'Fork' : 'Merge';
            executeBtn.innerHTML = `<i class="fas fa-play"></i> ${action} ${selectedCount} Selected Repositor${selectedCount === 1 ? 'y' : 'ies'}`;
        } else {
            executeBtn.innerHTML = '<i class="fas fa-play"></i> Execute Selected Action';
        }
    }

    async executeAction() {
        const operation = document.querySelector('input[name="operation"]:checked').value;
        const selectedRepoIds = Array.from(this.selectedRepos);
        const selectedRepos = this.repositories.filter(repo => selectedRepoIds.includes(repo.id.toString()));

        if (selectedRepos.length === 0) {
            this.showError('No repositories selected');
            return;
        }

        if (operation === 'fork') {
            await this.forkRepositories(selectedRepos);
        } else {
            await this.mergeRepositories(selectedRepos);
        }
    }

    async forkRepositories(repos) {
        this.showProgressSection();
        const results = [];
        
        for (let i = 0; i < repos.length; i++) {
            const repo = repos[i];
            const progress = ((i + 1) / repos.length) * 100;
            
            this.updateProgress(progress, `Forking ${repo.name} (${i + 1}/${repos.length})`);
            
            try {
                const [owner, repoName] = repo.full_name.split('/');
                const response = await fetch('/api/fork-repo', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        owner,
                        repo: repoName,
                        token: this.githubToken
                    })
                });

                const result = await response.json();
                
                if (response.ok) {
                    results.push({
                        repo: repo.name,
                        success: true,
                        url: result.fork_url,
                        clone_url: result.clone_url,
                        message: result.message
                    });
                } else {
                    results.push({
                        repo: repo.name,
                        success: false,
                        error: result.error,
                        details: result.details
                    });
                }
            } catch (error) {
                results.push({
                    repo: repo.name,
                    success: false,
                    error: error.message
                });
            }

            // Delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.updateProgress(100, 'Forking complete!');
        this.showResults(results, 'fork');
    }

    async mergeRepositories(repos) {
        const mergedRepoName = document.getElementById('merged-repo-name').value.trim();
        const mergedRepoDescription = document.getElementById('merged-repo-description').value.trim();
        const isPrivate = document.getElementById('merged-repo-private').checked;
        
        if (!mergedRepoName) {
            this.showError('Please enter a name for the merged repository');
            return;
        }

        this.showProgressSection();
        this.updateProgress(10, 'Creating merged repository...');

        try {
            const response = await fetch('/api/create-merged-repo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: mergedRepoName,
                    description: mergedRepoDescription,
                    repositories: repos.map(repo => ({
                        name: repo.name,
                        full_name: repo.full_name,
                        clone_url: repo.clone_url,
                        description: repo.description
                    })),
                    token: this.githubToken,
                    private: isPrivate
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                this.updateProgress(100, 'Repository created successfully!');
                this.showMergeInstructions(result);
            } else {
                throw new Error(result.error || 'Failed to create merged repository');
            }
        } catch (error) {
            this.updateProgress(0, 'Failed to create merged repository');
            this.showError(`Merge failed: ${error.message}`);
        }
    }

    showMergeInstructions(result) {
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');
        
        resultsContent.innerHTML = `
            <div class="merge-success">
                <div class="summary-card">
                    <h3>✅ Repository Created Successfully</h3>
                    <p><strong>Name:</strong> ${result.repository.name}</p>
                    <p><strong>URL:</strong> <a href="${result.repository.html_url}" target="_blank">${result.repository.html_url}</a></p>
                </div>
                
                <div class="merge-instructions">
                    <h4>📋 Manual Merge Instructions</h4>
                    <p>To complete the merge process, run the following commands locally:</p>
                    <div class="code-block">
                        <pre><code>${result.merge_instructions.steps.join('\n')}</code></pre>
                        <button class="copy-btn" onclick="navigator.clipboard.writeText('${result.merge_instructions.steps.join('\\n')}')">
                            📋 Copy Commands
                        </button>
                    </div>
                </div>
                
                <div class="merge-repos">
                    <h4>📦 Repositories to Merge</h4>
                    ${result.merge_instructions.repositories.map(repo => `
                        <div class="repo-merge-item">
                            <strong>${repo.name}</strong>
                            <p>${repo.description || 'No description'}</p>
                            <a href="${repo.clone_url}" target="_blank" class="clone-link">Clone URL</a>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    showProgressSection() {
        document.getElementById('progress-section').style.display = 'block';
        document.getElementById('execute-action').disabled = true;
    }

    updateProgress(percentage, text) {
        document.getElementById('progress-fill').style.width = `${percentage}%`;
        document.getElementById('progress-text').textContent = text;
    }

    showResults(results, operation) {
        const resultsSection = document.getElementById('results-section');
        const resultsContent = document.getElementById('results-content');
        
        const successCount = results.filter(r => r.success).length;
        const errorCount = results.length - successCount;
        
        resultsContent.innerHTML = `
            <div class="results-summary">
                <div class="summary-card">
                    <div class="summary-number">${successCount}</div>
                    <div class="summary-label">Successful</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${errorCount}</div>
                    <div class="summary-label">Failed</div>
                </div>
                <div class="summary-card">
                    <div class="summary-number">${results.length}</div>
                    <div class="summary-label">Total</div>
                </div>
            </div>
            
            <div class="results-list">
                ${results.map(result => `
                    <div class="result-item ${result.success ? 'success' : 'error'}">
                        <div class="result-header">
                            <strong>${result.repo}</strong>
                            <span class="result-status">${result.success ? '✅ Success' : '❌ Failed'}</span>
                        </div>
                        ${result.success ? `
                            <div class="result-actions">
                                <a href="${result.url}" target="_blank">View Repository</a>
                                <a href="${result.clone_url}" target="_blank">Clone URL</a>
                            </div>
                        ` : `
                            <div class="result-error">
                                <p><strong>Error:</strong> ${result.error}</p>
                                ${result.details ? `<p><strong>Details:</strong> ${result.details}</p>` : ''}
                            </div>
                        `}
                    </div>
                `).join('')}
            </div>
        `;
        
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    autoSaveSelections() {
        if (this.selectedRepos.size > 0) {
            const selections = {
                timestamp: Date.now(),
                selectedRepos: Array.from(this.selectedRepos),
                repositories: this.repositories.filter(repo => 
                    this.selectedRepos.has(repo.id.toString())
                ).map(repo => ({
                    id: repo.id,
                    name: repo.name,
                    full_name: repo.full_name
                }))
            };
            localStorage.setItem('caromar_selections', JSON.stringify(selections));
        }
    }

    getLanguageColor(language) {
        const colors = {
            'JavaScript': '#f7df1e',
            'TypeScript': '#3178c6',
            'Python': '#3776ab',
            'Java': '#ed8b00',
            'C++': '#00599c',
            'C': '#a8b9cc',
            'C#': '#239120',
            'HTML': '#e34c26',
            'CSS': '#1572b6',
            'Go': '#00add8',
            'Rust': '#dea584',
            'PHP': '#777bb4',
            'Ruby': '#cc342d',
            'Swift': '#fa7343',
            'Kotlin': '#7f52ff',
            'Dart': '#0175c2',
            'Shell': '#89e051',
            'Vue': '#4fc08d',
            'React': '#61dafb'
        };
        return colors[language] || '#8c959f';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) return 'yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showWarning(message) {
        this.showNotification(message, 'warning');
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;

        const colors = {
            success: '#1a7f37',
            error: '#d73a49',
            warning: '#fb8500'
        };

        notification.style.background = colors[type] || colors.success;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .org-badge {
        background: #0969da;
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: bold;
        margin-left: 5px;
    }
    .rate-limit-warning {
        color: #d73a49 !important;
        font-weight: bold;
    }
    .merge-tree {
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 12px;
        line-height: 1.6;
        background: #f6f8fa;
        padding: 1rem;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
    }
    .repo-folder {
        margin-left: 20px;
        margin: 5px 0 5px 20px;
    }
    .folder-content {
        margin-left: 20px;
        font-size: 11px;
        color: #656d76;
    }
    .code-block {
        background: #24292f;
        color: #f0f6fc;
        padding: 1rem;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 12px;
        margin: 1rem 0;
        position: relative;
    }
    .copy-btn {
        position: absolute;
        top: 5px;
        right: 5px;
        background: #0969da;
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        cursor: pointer;
    }
    .repo-merge-item {
        padding: 10px;
        border: 1px solid #d1d9e0;
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .clone-link {
        color: #0969da;
        text-decoration: none;
        font-size: 12px;
    }
`;
document.head.appendChild(style);

// Initialize the enhanced application
document.addEventListener('DOMContentLoaded', () => {
    new EnhancedCaromarApp();
});