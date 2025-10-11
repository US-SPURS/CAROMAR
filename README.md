# CAROMAR
**C**opy **A** **R**epository **O**r **M**erge **A**ll **R**epositories

A powerful web application that allows users to efficiently manage GitHub repositories by either forking individual repositories or merging multiple repositories into a single repository with organized folder structure.

![CAROMAR Interface](https://github.com/user-attachments/assets/a044e51e-4b80-4165-ada5-611b47eab378)

## Features

### 🔐 GitHub Authentication
- Secure GitHub Personal Access Token integration
- User profile validation and display
- Token storage for session persistence

### 🔍 Repository Discovery
- Search repositories by GitHub username
- Support for both personal and other users' repositories
- Comprehensive repository information display
- Language detection and visual indicators

### 📋 Repository Selection
- Interactive repository grid with checkboxes
- Bulk selection controls (Select All/Deselect All)
- Real-time selection counter and status updates

### 🚀 Two Operation Modes

#### 1. Fork Individual Repositories
- Fork each selected repository individually to your GitHub account
- Preserves original repository structure and history
- Batch processing with progress tracking
- Error handling for failed forks

#### 2. Merge into Single Repository
- Combines multiple repositories into one organized repository
- Each source repository becomes a main folder
- Maintains separation while creating unified access
- Custom naming for the merged repository

### 📊 Progress Tracking
- Real-time progress bars during operations
- Detailed status messages
- Comprehensive results display with success/error reporting
- Direct links to newly created repositories

### 🎨 User Experience
- Responsive design for desktop and mobile devices
- Modern, clean interface with GitHub-inspired styling
- Intuitive workflow with step-by-step guidance
- Error notifications and success confirmations

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- GitHub Personal Access Token

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/US-SPURS/CAROMAR.git
   cd CAROMAR
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration (optional for basic usage)
   ```

4. **Start the application:**
   ```bash
   npm start
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

### Development Mode

For development with auto-restart on file changes:
```bash
npm run dev
```

## Usage Guide

### Step 1: Authentication
1. Visit the CAROMAR web application
2. Click "Create Personal Access Token" to generate a GitHub token
3. Enter your token and click "Validate Token"
4. Your GitHub profile will be displayed once validated

### Step 2: Find Repositories
1. Enter a GitHub username (yours or another user's)
2. Click "Search Repositories" to load their repositories
3. Browse the repository grid with detailed information

### Step 3: Select Operation Mode
Choose between two operation modes:

**Fork Individual Repositories:**
- Select repositories you want to fork
- Each will be forked individually to your account
- Maintains original repository structure

**Merge into Single Repository:**
- Select multiple repositories to combine
- Enter a name for the merged repository
- Creates one repository with all selected repos as folders

### Step 4: Execute Action
1. Select your desired repositories using checkboxes
2. Use "Select All" or "Deselect All" for bulk operations
3. Click the "Execute" button to start the process
4. Monitor progress with real-time status updates

### Step 5: Review Results
- View detailed results of the operation
- Access direct links to newly created repositories
- Review any errors or issues encountered

## GitHub Token Setup

To use CAROMAR, you need a GitHub Personal Access Token:

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select appropriate scopes:
   - `repo` (for repository access)
   - `user` (for user information)
4. Copy the generated token
5. Enter it in the CAROMAR application

**Security Note:** Your token is stored locally in your browser and used only for GitHub API calls. It's never sent to external servers.

## API Endpoints

The application provides several REST API endpoints:

- `GET /api/user` - Validate token and get user information
- `GET /api/search-repos` - Search repositories for a user
- `POST /api/fork-repo` - Fork a specific repository

## Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Templating:** EJS
- **HTTP Client:** Axios
- **GitHub Integration:** GitHub REST API v3

## Project Structure

```
CAROMAR/
├── public/
│   ├── css/
│   │   └── style.css          # Application styling
│   └── js/
│       └── app.js             # Frontend JavaScript logic
├── views/
│   └── index.ejs              # Main HTML template
├── server.js                  # Express server and API endpoints
├── package.json               # Project dependencies
├── .env.example               # Environment variables template
└── README.md                  # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you encounter any issues or have questions:
1. Check the GitHub Issues page
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

## Acknowledgments

- GitHub API for repository management capabilities
- Font Awesome for icons
- Modern web standards for responsive design
