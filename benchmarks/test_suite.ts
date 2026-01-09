/**
 * ARIA Benchmark Test Suite
 * 
 * Automated testing framework for comparing ARIA against other web agents.
 * Runs 20 standardized tasks and generates performance metrics.
 */

export interface TestResult {
    taskId: string;
    taskName: string;
    category: string;
    success: boolean;
    executionTime: number;
    steps: number;
    errors: string[];
    timestamp: number;
}

export interface AgentScore {
    agentName: string;
    totalScore: number;
    successRate: number;
    avgExecutionTime: number;
    categoryScores: Record<string, number>;
    results: TestResult[];
}

export interface ComparisonReport {
    testDate: Date;
    agents: AgentScore[];
    summary: {
        winner: string;
        highlights: string[];
    };
}

// ======================
// Test Task Definitions
// ======================

export const BENCHMARK_TASKS = [
    // ===== SIMPLE SEARCH (5 tasks) =====
    {
        id: 'search-youtube-1',
        category: 'Simple Search',
        name: 'YouTube: Search for lofi hip hop',
        description: 'Navigate to YouTube and search for "lofi hip hop"',
        url: 'https://www.youtube.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 30000,
        validation: {
            urlContains: 'search_query=lofi',
            pageHas: 'ytd-search'
        }
    },
    {
        id: 'search-amazon-1',
        category: 'Simple Search',
        name: 'Amazon: Search for iPhone 15 Pro',
        description: 'Navigate to Amazon and search for "iPhone 15 Pro"',
        url: 'https://www.amazon.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 30000,
        validation: {
            urlContains: 'k=iPhone',
            pageHas: 's-search-results'
        }
    },
    {
        id: 'search-github-1',
        category: 'Simple Search',
        name: 'GitHub: Search for AI agents',
        description: 'Navigate to GitHub and search for "AI agents"',
        url: 'https://github.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 30000,
        validation: {
            urlContains: 'q=AI+agents',
            pageHas: 'search-results'
        }
    },
    {
        id: 'search-linkedin-1',
        category: 'Simple Search',
        name: 'LinkedIn: Search for software engineer',
        description: 'Navigate to LinkedIn and search for "software engineer"',
        url: 'https://www.linkedin.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 30000,
        validation: {
            urlContains: 'keywords=software',
            pageHas: 'search-results'
        }
    },
    {
        id: 'search-twitter-1',
        category: 'Simple Search',
        name: 'Twitter: Search for web automation',
        description: 'Navigate to Twitter and search for "web automation"',
        url: 'https://twitter.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 30000,
        validation: {
            urlContains: 'q=web%20automation',
            pageHas: 'search-result'
        }
    },

    // ===== FORM FILLING (5 tasks) =====
    {
        id: 'form-contact-1',
        category: 'Form Filling',
        name: 'Contact Form: Fill name and email',
        description: 'Fill a standard contact form with name and email',
        url: 'https://www.example.com/contact',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 45000,
        validation: {
            formSubmitted: true,
            fieldsPopulated: ['name', 'email']
        }
    },
    {
        id: 'form-signup-1',
        category: 'Form Filling',
        name: 'Signup Form: Complete registration',
        description: 'Fill signup form with username, email, password',
        url: 'https://www.example.com/signup',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'TYPE', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 60000,
        validation: {
            formSubmitted: true,
            fieldsPopulated: ['username', 'email', 'password']
        }
    },
    {
        id: 'form-survey-1',
        category: 'Form Filling',
        name: 'Survey: Answer multiple choice questions',
        description: 'Complete a survey with radio buttons and checkboxes',
        url: 'https://docs.google.com/forms/d/e/example',
        expectedSteps: ['NAVIGATE', 'FIND', 'CLICK', 'FIND', 'CLICK', 'FIND', 'CLICK', 'FIND', 'CLICK'],
        points: 5,
        timeout: 60000,
        validation: {
            formSubmitted: true,
            questionsAnswered: 3
        }
    },
    {
        id: 'form-address-1',
        category: 'Form Filling',
        name: 'Address Form: Fill complete address',
        description: 'Fill form with street, city, state, zip',
        url: 'https://www.example.com/checkout',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'TYPE', 'FIND', 'SELECT', 'FIND', 'TYPE'],
        points: 5,
        timeout: 60000,
        validation: {
            fieldsPopulated: ['street', 'city', 'state', 'zip']
        }
    },
    {
        id: 'form-multipage-1',
        category: 'Form Filling',
        name: 'Multi-page Form: Complete wizard',
        description: 'Fill 3-page form wizard with navigation',
        url: 'https://www.example.com/wizard',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'FIND', 'TYPE', 'FIND', 'CLICK', 'FIND', 'TYPE', 'FIND', 'CLICK'],
        points: 5,
        timeout: 90000,
        validation: {
            formSubmitted: true,
            pagesCompleted: 3
        }
    },

    // ===== MULTI-PAGE NAVIGATION (5 tasks) =====
    {
        id: 'nav-product-detail-1',
        category: 'Multi-Page Nav',
        name: 'Amazon: Navigate to product details',
        description: 'Search for product and click first result',
        url: 'https://www.amazon.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'FIND'],
        points: 5,
        timeout: 45000,
        validation: {
            urlContains: '/dp/',
            pageHas: 'product-title'
        }
    },
    {
        id: 'nav-user-profile-1',
        category: 'Multi-Page Nav',
        name: 'GitHub: Navigate to user profile',
        description: 'Search for user and open profile page',
        url: 'https://github.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'FIND'],
        points: 5,
        timeout: 45000,
        validation: {
            urlPattern: /github\.com\/[\w-]+$/,
            pageHas: 'user-profile'
        }
    },
    {
        id: 'nav-article-read-1',
        category: 'Multi-Page Nav',
        name: 'Wikipedia: Search and read article',
        description: 'Search for topic and navigate to article',
        url: 'https://www.wikipedia.org/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT'],
        points: 5,
        timeout: 45000,
        validation: {
            urlContains: 'wiki/',
            pageHas: 'mw-content-text'
        }
    },
    {
        id: 'nav-job-details-1',
        category: 'Multi-Page Nav',
        name: 'LinkedIn: Open job posting',
        description: 'Search for job and open details page',
        url: 'https://www.linkedin.com/jobs/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'FIND'],
        points: 5,
        timeout: 60000,
        validation: {
            urlContains: '/jobs/view/',
            pageHas: 'job-details'
        }
    },
    {
        id: 'nav-thread-open-1',
        category: 'Multi-Page Nav',
        name: 'Reddit: Open thread from search',
        description: 'Search for topic and open discussion thread',
        url: 'https://www.reddit.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'FIND'],
        points: 5,
        timeout: 45000,
        validation: {
            urlContains: '/comments/',
            pageHas: 'Post'
        }
    },

    // ===== DATA EXTRACTION (5 tasks) =====
    {
        id: 'extract-prices-1',
        category: 'Data Extraction',
        name: 'Amazon: Extract product prices',
        description: 'Search and extract top 5 product prices',
        url: 'https://www.amazon.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'EXTRACT'],
        points: 5,
        timeout: 60000,
        validation: {
            dataExtracted: true,
            minItems: 5,
            fields: ['price', 'title']
        }
    },
    {
        id: 'extract-repos-1',
        category: 'Data Extraction',
        name: 'GitHub: Extract repository stats',
        description: 'Search and extract stars/forks for top repos',
        url: 'https://github.com/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'EXTRACT'],
        points: 5,
        timeout: 60000,
        validation: {
            dataExtracted: true,
            minItems: 5,
            fields: ['stars', 'forks', 'name']
        }
    },
    {
        id: 'extract-jobs-1',
        category: 'Data Extraction',
        name: 'LinkedIn: Extract job listings',
        description: 'Search and extract job titles and companies',
        url: 'https://www.linkedin.com/jobs/',
        expectedSteps: ['NAVIGATE', 'FIND', 'TYPE', 'FIND', 'CLICK', 'WAIT', 'EXTRACT'],
        points: 5,
        timeout: 60000,
        validation: {
            dataExtracted: true,
            minItems: 5,
            fields: ['title', 'company']
        }
    },
    {
        id: 'extract-articles-1',
        category: 'Data Extraction',
        name: 'News Site: Extract article headlines',
        description: 'Navigate and extract top 10 headlines',
        url: 'https://news.ycombinator.com/',
        expectedSteps: ['NAVIGATE', 'WAIT', 'EXTRACT'],
        points: 5,
        timeout: 45000,
        validation: {
            dataExtracted: true,
            minItems: 10,
            fields: ['title', 'link']
        }
    },
    {
        id: 'extract-table-1',
        category: 'Data Extraction',
        name: 'Wikipedia: Extract table data',
        description: 'Navigate to article and extract table rows',
        url: 'https://en.wikipedia.org/wiki/List_of_countries_by_population',
        expectedSteps: ['NAVIGATE', 'WAIT', 'FIND', 'EXTRACT'],
        points: 5,
        timeout: 45000,
        validation: {
            dataExtracted: true,
            minItems: 10,
            fields: ['country', 'population']
        }
    }
];

// ======================
// Scoring System
// ======================

export function calculateScore(result: TestResult, task: typeof BENCHMARK_TASKS[0]): number {
    let score = 0;
    
    // Success/Failure (60% of points)
    if (result.success) {
        score += task.points * 0.6;
    }
    
    // Execution time (20% of points)
    const timeRatio = Math.min(1, task.timeout / result.executionTime);
    score += task.points * 0.2 * timeRatio;
    
    // Step efficiency (20% of points)
    const stepEfficiency = Math.min(1, task.expectedSteps.length / result.steps);
    score += task.points * 0.2 * stepEfficiency;
    
    return Math.round(score * 100) / 100;
}

export function aggregateResults(results: TestResult[]): AgentScore {
    const totalTests = results.length;
    const successfulTests = results.filter(r => r.success).length;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);
    
    const categoryScores: Record<string, number> = {};
    const categories = ['Simple Search', 'Form Filling', 'Multi-Page Nav', 'Data Extraction'];
    
    categories.forEach(cat => {
        const catResults = results.filter(r => r.category === cat);
        const catSuccess = catResults.filter(r => r.success).length;
        categoryScores[cat] = catSuccess / catResults.length;
    });
    
    const totalScore = results.reduce((sum, r) => {
        const task = BENCHMARK_TASKS.find(t => t.id === r.taskId);
        return sum + (task ? calculateScore(r, task) : 0);
    }, 0);
    
    return {
        agentName: 'Unknown',
        totalScore: Math.round(totalScore * 100) / 100,
        successRate: successfulTests / totalTests,
        avgExecutionTime: Math.round(totalTime / totalTests),
        categoryScores,
        results
    };
}

// ======================
// Comparison Functions
// ======================

export function compareAgents(agents: AgentScore[]): ComparisonReport {
    const sortedAgents = [...agents].sort((a, b) => b.totalScore - a.totalScore);
    const winner = sortedAgents[0];
    
    const highlights: string[] = [];
    
    // Overall winner
    highlights.push(`${winner.agentName} wins with ${winner.totalScore} points (${(winner.successRate * 100).toFixed(1)}% success rate)`);
    
    // Speed comparison
    const fastest = [...agents].sort((a, b) => a.avgExecutionTime - b.avgExecutionTime)[0];
    highlights.push(`${fastest.agentName} is fastest with avg ${fastest.avgExecutionTime}ms per task`);
    
    // Category winners
    const categories = ['Simple Search', 'Form Filling', 'Multi-Page Nav', 'Data Extraction'];
    categories.forEach(cat => {
        const catWinner = [...agents].sort((a, b) => 
            (b.categoryScores[cat] || 0) - (a.categoryScores[cat] || 0)
        )[0];
        const score = ((catWinner.categoryScores[cat] || 0) * 100).toFixed(1);
        highlights.push(`${catWinner.agentName} leads in ${cat} with ${score}% success`);
    });
    
    return {
        testDate: new Date(),
        agents: sortedAgents,
        summary: {
            winner: winner.agentName,
            highlights
        }
    };
}

// ======================
// Report Generation
// ======================

export function generateMarkdownReport(comparison: ComparisonReport): string {
    let report = '# Benchmark Comparison Report\n\n';
    report += `**Test Date**: ${comparison.testDate.toISOString()}\n\n`;
    report += '---\n\n';
    
    // Summary
    report += '## Summary\n\n';
    report += `**Winner**: ${comparison.summary.winner}\n\n`;
    report += '**Highlights**:\n';
    comparison.summary.highlights.forEach(h => {
        report += `- ${h}\n`;
    });
    report += '\n---\n\n';
    
    // Overall Scores
    report += '## Overall Scores\n\n';
    report += '| Agent | Total Score | Success Rate | Avg Time (ms) |\n';
    report += '|-------|-------------|--------------|---------------|\n';
    comparison.agents.forEach(agent => {
        report += `| ${agent.agentName} | ${agent.totalScore} | ${(agent.successRate * 100).toFixed(1)}% | ${agent.avgExecutionTime} |\n`;
    });
    report += '\n---\n\n';
    
    // Category Breakdown
    report += '## Category Performance\n\n';
    const categories = ['Simple Search', 'Form Filling', 'Multi-Page Nav', 'Data Extraction'];
    categories.forEach(cat => {
        report += `### ${cat}\n\n`;
        report += '| Agent | Success Rate |\n';
        report += '|-------|-------------|\n';
        comparison.agents.forEach(agent => {
            const score = ((agent.categoryScores[cat] || 0) * 100).toFixed(1);
            report += `| ${agent.agentName} | ${score}% |\n`;
        });
        report += '\n';
    });
    
    report += '---\n\n';
    
    // Detailed Results
    report += '## Detailed Results\n\n';
    comparison.agents.forEach(agent => {
        report += `### ${agent.agentName}\n\n`;
        report += '| Task | Category | Success | Time (ms) | Score |\n';
        report += '|------|----------|---------|-----------|-------|\n';
        agent.results.forEach(result => {
            const task = BENCHMARK_TASKS.find(t => t.id === result.taskId);
            const score = task ? calculateScore(result, task) : 0;
            report += `| ${result.taskName} | ${result.category} | ${result.success ? '✅' : '❌'} | ${result.executionTime} | ${score} |\n`;
        });
        report += '\n';
    });
    
    return report;
}

// ======================
// Test Runner Interface
// ======================

export interface TestRunner {
    runTask(task: typeof BENCHMARK_TASKS[0]): Promise<TestResult>;
    getName(): string;
}

export async function runBenchmarkSuite(runners: TestRunner[]): Promise<ComparisonReport> {
    const agentScores: AgentScore[] = [];
    
    for (const runner of runners) {
        console.log(`\n=== Running tests for ${runner.getName()} ===\n`);
        const results: TestResult[] = [];
        
        for (const task of BENCHMARK_TASKS) {
            console.log(`Running: ${task.name}...`);
            try {
                const result = await runner.runTask(task);
                results.push(result);
                console.log(`  ${result.success ? '✅ Success' : '❌ Failed'} in ${result.executionTime}ms`);
            } catch (error) {
                console.log(`  ❌ Error: ${error}`);
                results.push({
                    taskId: task.id,
                    taskName: task.name,
                    category: task.category,
                    success: false,
                    executionTime: task.timeout,
                    steps: 0,
                    errors: [String(error)],
                    timestamp: Date.now()
                });
            }
        }
        
        const score = aggregateResults(results);
        score.agentName = runner.getName();
        agentScores.push(score);
    }
    
    return compareAgents(agentScores);
}

// ======================
// Export for use
// ======================

export default {
    BENCHMARK_TASKS,
    calculateScore,
    aggregateResults,
    compareAgents,
    generateMarkdownReport,
    runBenchmarkSuite
};

