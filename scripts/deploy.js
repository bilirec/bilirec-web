// scripts/deploy.js
import { execSync } from 'node:child_process';

function getBranchName() {
    if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;
    if (process.env.CF_PAGES_BRANCH) return process.env.CF_PAGES_BRANCH;

    try {
        return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    } catch (e) {
        console.error('Error getting branch name:', e);
        return '';
    }
}

const currentBranch = getBranchName();

if (!currentBranch) {
    console.error('❌ [Deploy Error] Could not determine Git branch name. Deployment aborted.');
    process.exit(1);
}

console.log(`Current deployment branch: ${currentBranch}`);

if (currentBranch === 'develop') {
    console.log('🚀 Deploying to DEV environment (Custom Domain)...');
    execSync('pnpm deploy:nightly', { stdio: 'inherit' });
} else if (currentBranch === 'main') {
    console.log('🚀 Deploying to PRODUCTION environment...');
    execSync('pnpm deploy:main', { stdio: 'inherit' });
} else {
    console.log('🔍 Deploying as standard Branch Preview (*.workers.dev)...');
    execSync('pnpm deploy:preview', { stdio: 'inherit' });
}