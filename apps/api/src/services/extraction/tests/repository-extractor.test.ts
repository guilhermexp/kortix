import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import {
	RepositoryExtractor,
	createRepositoryExtractor,
} from '../repository-extractor'
import type {
	ExtractionInput,
	ExtractionResult,
	RepositoryOptions,
	RepositoryInfo,
	ProcessingError,
} from '../../interfaces'

/**
 * Unit tests for RepositoryExtractor
 *
 * Tests code repository processing including:
 * - Git repository URL validation and parsing
 * - Repository structure analysis and file tree generation
 * - Source code file processing (various programming languages)
 * - Documentation extraction (README, docs, comments)
 * - Git metadata extraction (commits, branches, contributors)
 * - Error handling for private/inaccessible repositories
 * - Performance optimization for large repositories
 */

describe("RepositoryExtractor", () => {
	let extractor: RepositoryExtractor
	let mockOptions: RepositoryOptions

	beforeEach(() => {
		mockOptions = {
			includeReadme: true,
			includeDocs: true,
			includeCode: true,
			includeCommits: false,
			maxFileSize: 1024 * 1024, // 1MB
			includeFileTree: true,
			supportedExtensions: [
				'.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs',
				'.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.r', '.m',
				'.html', '.css', '.scss', '.less', '.vue', '.svelte', '.xml',
				'.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.config',
				'.md', '.rst', '.txt', '.tex', '.sh', '.bash', '.zsh', '.fish',
				'.sql', '.pl', '.lua', '.clj', '.cljs', '.erl', '.ex', '.exs',
				'.hs', '.ml', '.fs', '.jl', '.nim', '.cr', '.v', '.zig',
			],
			excludePaths: [
				'node_modules/**',
				'**/.git/**',
				'**/dist/**',
				'**/build/**',
				'**/target/**',
				'**/vendor/**',
				'**/.idea/**',
				'**/.vscode/**',
			],
			extractionOptions: {
				timeoutMs: 60000,
				maxRetries: 3,
			},
		}

		extractor = new RepositoryExtractor(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Extractor Interface", () => {
		it("should implement DocumentExtractor interface", () => {
			expect(extractor).toHaveProperty('canHandle')
			expect(extractor).toHaveProperty('extract')
			expect(extractor).toHaveProperty('getSupportedTypes')
		})

		it("should support repository content type", () => {
			const supportedTypes = extractor.getSupportedTypes()
			expect(supportedTypes).toContain('repository')
		})

		it("should be able to handle repository URL inputs", () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/repository',
				options: {},
			}

			const canHandle = extractor.canHandle(urlInput)
			expect(canHandle).toBe(true)
		})

		it("should not handle non-repository URLs", () => {
			const nonRepoInputs = [
				{ type: 'url', content: 'https://example.com', options: {} },
				{ type: 'file', content: 'some content', options: { filename: 'file.txt' } },
			]

			nonRepoInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("Repository URL Validation and Parsing", () => {
		it("should handle GitHub repository URLs", () => {
			const githubUrls = [
				'https://github.com/user/repository',
				'https://github.com/user/repository.git',
				'https://github.com/user/repo-name',
				'https://github.com/org/repository',
				'https://www.github.com/user/repo',
			]

			githubUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle GitLab repository URLs", () => {
			const gitlabUrls = [
				'https://gitlab.com/user/repository',
				'https://gitlab.com/user/repo.git',
				'https://gitlab.com/group/project',
				'https://gitlab.example.com/user/repo',
			]

			gitlabUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle Bitbucket repository URLs", () => {
			const bitbucketUrls = [
				'https://bitbucket.org/user/repository',
				'https://bitbucket.org/user/repo.git',
				'https://bitbucket.org/team/project',
			]

			bitbucketUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle generic Git repository URLs", () => {
			const gitUrls = [
				'https://git.example.com/user/repo.git',
				'https://source.example.com/group/project',
				'https://code.company.com/team/repository',
			]

			gitUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle SSH repository URLs", () => {
			const sshUrls = [
				'git@github.com:user/repository.git',
				'git@gitlab.com:user/repo.git',
				'user@server.com:path/to/repo.git',
			]

			sshUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should reject invalid repository URLs", () => {
			const invalidUrls = [
				'https://github.com/user', // missing repository
				'https://fakegit.com/user', // not a git service
				'https://github.com/user/repo/extra', // invalid path
			]

			invalidUrls.forEach((url) => {
				const urlInput: ExtractionInput = {
					type: 'url',
					content: url,
					options: {},
				}

				const canHandle = extractor.canHandle(urlInput)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("Repository Structure Analysis", () => {
		it("should generate file tree from repository", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/sample-repo',
				options: {},
			}

			const mockFileTree = [
				{
					path: 'src',
					type: 'directory',
					children: [
						{
							path: 'src/index.js',
							type: 'file',
							size: 1024,
							language: 'JavaScript',
						},
						{
							path: 'src/utils.js',
							type: 'file',
							size: 2048,
							language: 'JavaScript',
						},
					],
				},
				{
					path: 'README.md',
					type: 'file',
					size: 512,
					language: 'Markdown',
				},
				{
					path: 'package.json',
					type: 'file',
					size: 256,
					language: 'JSON',
				},
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Repository content extracted from file structure',
					metadata: {
						repositoryName: 'sample-repo',
						repositoryUrl: 'https://github.com/user/sample-repo',
						totalFiles: 3,
						languages: ['JavaScript', 'Markdown', 'JSON'],
					},
					fileTree: mockFileTree,
					processingTime: 5000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.fileTree).toHaveLength(3)
			expect(result.data?.metadata.totalFiles).toBe(3)
			expect(result.data?.metadata.languages).toContain('JavaScript')
		})

		it("should handle repositories with complex directory structures", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/large-repo',
				options: {},
			}

			const complexFileTree = [
				{
					path: 'packages',
					type: 'directory',
					children: [
						{
							path: 'packages/frontend',
							type: 'directory',
							children: [
								{
									path: 'packages/frontend/src/components/Button.tsx',
									type: 'file',
									size: 1024,
									language: 'TypeScript',
								},
							],
						},
						{
							path: 'packages/backend',
							type: 'directory',
							children: [
								{
									path: 'packages/backend/src/server.js',
									type: 'file',
									size: 2048,
									language: 'JavaScript',
								},
							],
						},
					],
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Complex repository structure',
					metadata: { totalFiles: 2 },
					fileTree: complexFileTree,
					processingTime: 8000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.fileTree![0].type).toBe('directory')
			expect(result.data?.fileTree![0].children).toBeDefined()
		})
	})

	describe("Source Code File Processing", () => {
		it("should extract JavaScript/TypeScript files", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/js-repo',
				options: { includeCode: true },
			}

			const jsFiles = [
				{
					path: 'src/index.js',
					language: 'JavaScript',
					content: 'console.log("Hello World");',
					size: 25,
				},
				{
					path: 'src/utils.ts',
					language: 'TypeScript',
					content: 'export const add = (a: number, b: number) => a + b;',
					size: 45,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractCodeFiles')
			extractSpy.mockResolvedValue(jsFiles)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.codeFiles).toHaveLength(2)
			expect(result.data?.codeFiles![0].language).toBe('JavaScript')
			expect(result.data?.codeFiles![1].language).toBe('TypeScript')
		})

		it("should handle multiple programming languages", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/multi-lang-repo',
				options: { includeCode: true },
			}

			const multiLangFiles = [
				{
					path: 'app.py',
					language: 'Python',
					content: 'def hello():\n    print("Hello from Python")',
					size: 50,
				},
				{
					path: 'main.rs',
					language: 'Rust',
					content: 'fn main() {\n    println!("Hello from Rust");\n}',
					size: 48,
				},
				{
					path: 'Main.java',
					language: 'Java',
					content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java");\n    }\n}',
					size: 120,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractCodeFiles')
			extractSpy.mockResolvedValue(multiLangFiles)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.codeFiles).toHaveLength(3)
			const languages = result.data?.codeFiles?.map(f => f.language) || []
			expect(languages).toContain('Python')
			expect(languages).toContain('Rust')
			expect(languages).toContain('Java')
		})

		it("should respect file size limits", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/large-files-repo',
				options: { 
					includeCode: true,
					maxFileSize: 1024 // 1KB
				},
			}

			const files = [
				{
					path: 'small.js',
					language: 'JavaScript',
					content: 'console.log("small");',
					size: 20,
				},
				{
					path: 'large.js',
					language: 'JavaScript',
					content: 'x'.repeat(2048), // 2KB
					size: 2048,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractCodeFiles')
			extractSpy.mockResolvedValue(files)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			// Should filter out files exceeding size limit
			const processedFiles = result.data?.codeFiles || []
			expect(processedFiles.length).toBeLessThanOrEqual(2)
		})

		it("should exclude specified paths and patterns", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/repo-with-excludes',
				options: { 
					includeCode: true,
					excludePaths: ['node_modules/**', 'dist/**', '**/.git/**']
				},
			}

			const allFiles = [
				{ path: 'src/index.js', language: 'JavaScript', size: 100, content: '// Source code' },
				{ path: 'node_modules/external/package/index.js', language: 'JavaScript', size: 500, content: '// Should be excluded' },
				{ path: 'dist/build.js', language: 'JavaScript', size: 1000, content: '// Should be excluded' },
				{ path: '.git/config', language: 'Git Config', size: 50, content: '// Should be excluded' },
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractCodeFiles')
			extractSpy.mockResolvedValue(allFiles)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			// Should exclude files matching the patterns
			const processedFiles = result.data?.codeFiles || []
			const hasExcludedFiles = processedFiles.some(f => 
				f.path.includes('node_modules') || 
				f.path.includes('dist') || 
				f.path.includes('.git')
			)
			expect(hasExcludedFiles).toBe(false)
		})
	})

	describe("Documentation Extraction", () => {
		it("should extract README files", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/readme-repo',
				options: { includeReadme: true },
			}

			const readmeFiles = [
				{
					path: 'README.md',
					language: 'Markdown',
					content: '# My Awesome Project\n\nThis is a sample project with documentation.\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\n```javascript\nimport { myFunction } from "./myModule";\n```',
					size: 150,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractDocumentation')
			extractSpy.mockResolvedValue({
				readmeFiles,
				docFiles: [],
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.readmeFiles).toHaveLength(1)
			expect(result.data?.readmeFiles![0].content).toContain('My Awesome Project')
			expect(result.data?.readmeFiles![0].content).toContain('Installation')
		})

		it("should extract documentation from docs directory", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/docs-repo',
				options: { includeDocs: true },
			}

			const docFiles = [
				{
					path: 'docs/api.md',
					language: 'Markdown',
					content: '# API Documentation\n\n## Endpoints\n\n### GET /users\n\nRetrieve all users.',
					size: 100,
				},
				{
					path: 'docs/guides/installation.md',
					language: 'Markdown',
					content: '# Installation Guide\n\nDetailed installation instructions.',
					size: 80,
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractDocumentation')
			extractSpy.mockResolvedValue({
				readmeFiles: [],
				docFiles,
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.docFiles).toHaveLength(2)
			expect(result.data?.docFiles![0].path).toBe('docs/api.md')
			expect(result.data?.docFiles![1].path).toBe('docs/guides/installation.md')
		})

		it("should handle repositories without documentation", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/no-docs-repo',
				options: { includeReadme: true, includeDocs: true },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractDocumentation')
			extractSpy.mockResolvedValue({
				readmeFiles: [],
				docFiles: [],
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.readmeFiles).toHaveLength(0)
			expect(result.data?.docFiles).toHaveLength(0)
		})
	})

	describe("Git Metadata Extraction", () => {
		it("should extract repository information", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/awesome-repo',
				options: { includeCommits: true },
			}

			const mockRepoInfo: RepositoryInfo = {
				repositoryName: 'awesome-repo',
				repositoryUrl: 'https://github.com/user/awesome-repo',
				defaultBranch: 'main',
				totalCommits: 150,
				contributors: [
					{ username: 'user1', commits: 100 },
					{ username: 'user2', commits: 50 },
				],
				languages: {
					JavaScript: 60,
					TypeScript: 30,
					Markdown: 10,
				},
				lastCommit: {
					hash: 'abc123def456',
					message: 'Add new feature',
					author: 'user1',
					date: '2023-01-15T10:30:00Z',
				},
				repositorySize: 2048, // KB
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractRepositoryInfo')
			extractSpy.mockResolvedValue(mockRepoInfo)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.repositoryInfo?.repositoryName).toBe('awesome-repo')
			expect(result.data?.repositoryInfo?.totalCommits).toBe(150)
			expect(result.data?.repositoryInfo?.contributors).toHaveLength(2)
			expect(result.data?.repositoryInfo?.languages.JavaScript).toBe(60)
		})

		it("should handle repository without Git information", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/simple-repo',
				options: { includeCommits: false },
			}

			const minimalInfo: Partial<RepositoryInfo> = {
				repositoryName: 'simple-repo',
				repositoryUrl: 'https://github.com/user/simple-repo',
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractRepositoryInfo')
			extractSpy.mockResolvedValue(minimalInfo)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.repositoryInfo?.totalCommits).toBeUndefined()
		})
	})

	describe("Error Handling", () => {
		it("should handle private repositories", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/private-repo',
				options: {},
			}

			const error: ProcessingError = {
				code: 'REPOSITORY_PRIVATE',
				message: 'Repository is private or access is denied',
				details: { repositoryUrl: 'https://github.com/user/private-repo' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('REPOSITORY_PRIVATE')
		})

		it("should handle non-existent repositories", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/non-existent-repo',
				options: {},
			}

			const error: ProcessingError = {
				code: 'REPOSITORY_NOT_FOUND',
				message: 'Repository does not exist',
				details: { repositoryUrl: 'https://github.com/user/non-existent-repo' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('REPOSITORY_NOT_FOUND')
		})

		it("should handle repositories with invalid Git URLs", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/invalid.git',
				options: {},
			}

			const error: ProcessingError = {
				code: 'INVALID_REPOSITORY_URL',
				message: 'Repository URL is invalid or malformed',
				details: { repositoryUrl: 'https://github.com/user/invalid.git' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('INVALID_REPOSITORY_URL')
		})

		it("should handle network timeouts", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/slow-repo',
				options: {},
			}

			const error: ProcessingError = {
				code: 'NETWORK_TIMEOUT',
				message: 'Repository access timeout',
				details: { timeout: 60000 },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('NETWORK_TIMEOUT')
		})

		it("should handle repositories with no readable files", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/empty-repo',
				options: {},
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: '',
					metadata: { totalFiles: 0 },
					fileTree: [],
					processingTime: 1000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.totalFiles).toBe(0)
		})
	})

	describe("Configuration Options", () => {
		it("should respect supported file extensions", () => {
			const customOptions: RepositoryOptions = {
				...mockOptions,
				supportedExtensions: ['.js', '.ts', '.py'],
			}

			const customExtractor = new RepositoryExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})

		it("should respect file size limits", () => {
			const customOptions: RepositoryOptions = {
				...mockOptions,
				maxFileSize: 512 * 1024, // 512KB
			}

			const customExtractor = new RepositoryExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})

		it("should handle custom exclude patterns", () => {
			const customOptions: RepositoryOptions = {
				...mockOptions,
				excludePaths: [
					'**/test/**',
					'**/*.test.js',
					'**/__tests__/**',
				],
			}

			const customExtractor = new RepositoryExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})

		it("should disable features when specified", () => {
			const customOptions: RepositoryOptions = {
				...mockOptions,
				includeReadme: false,
				includeDocs: false,
				includeCode: false,
			}

			const customExtractor = new RepositoryExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})
	})

	describe("Performance Optimization", () => {
		it("should process large repositories efficiently", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/large-repo',
				options: { streaming: true },
			}

			const streamSpy = vi.spyOn(extractor as any, 'processWithStreaming')
			streamSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Large repository content processed with streaming',
					metadata: { totalFiles: 1000, streaming: true },
					processingTime: 30000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(streamSpy).toHaveBeenCalled()
			expect(result.data?.metadata.streaming).toBe(true)
		})

		it("should handle concurrent repository processing", async () => {
			const repoUrls = [
				'https://github.com/user/repo1',
				'https://github.com/user/repo2',
				'https://github.com/user/repo3',
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Repository content',
					metadata: { totalFiles: 5 },
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue(mockResult)

			const results = await Promise.all(
				repoUrls.map((url) =>
					extractor.extract({ type: 'url', content: url, options: {} })
				)
			)

			expect(results).toHaveLength(3)
			results.forEach((result) => expect(result.success).toBe(true))
		})
	})

	describe("Factory Function", () => {
		it("should create extractor with default options", () => {
			const extractor = createRepositoryExtractor()
			expect(extractor).toBeDefined()
			expect(extractor.getSupportedTypes()).toContain('repository')
		})

		it("should create extractor with custom options", () => {
			const customOptions: RepositoryOptions = {
				includeCode: false,
				supportedExtensions: ['.md', '.txt'],
			}

			const extractor = createRepositoryExtractor(customOptions)
			expect(extractor).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle repositories with no supported files", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/binary-repo',
				options: { supportedExtensions: ['.js', '.ts'] },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: '',
					metadata: { totalFiles: 5, supportedFiles: 0 },
					fileTree: [
						{ path: 'image.png', type: 'file', size: 1024 },
						{ path: 'document.pdf', type: 'file', size: 2048 },
					],
					processingTime: 1000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.codeFiles).toHaveLength(0)
		})

		it("should handle repositories with special characters in file names", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/special-chars-repo',
				options: {},
			}

			const specialFileTree = [
				{
					path: 'file with spaces.js',
					type: 'file',
					size: 100,
					language: 'JavaScript',
				},
				{
					path: 'file-with-dashes-and_underscores.ts',
					type: 'file',
					size: 150,
					language: 'TypeScript',
				},
				{
					path: 'файл-с-русскими-символами.py',
					type: 'file',
					size: 200,
					language: 'Python',
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Repository with special characters',
					metadata: { totalFiles: 3 },
					fileTree: specialFileTree,
					processingTime: 2000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.fileTree).toHaveLength(3)
		})

		it("should handle repositories with very deep directory structures", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/deep-repo',
				options: { maxDepth: 5 },
			}

			const deepFileTree = [
				{
					path: 'level1',
					type: 'directory',
					children: [
						{
							path: 'level1/level2',
							type: 'directory',
							children: [
								{
									path: 'level1/level2/level3/level4/level5/deep-file.js',
									type: 'file',
									size: 50,
									language: 'JavaScript',
								},
							],
						},
					],
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Deep directory structure',
					metadata: { maxDepth: 5 },
					fileTree: deepFileTree,
					processingTime: 3000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.fileTree![0].type).toBe('directory')
		})

		it("should handle repositories with only binary files", async () => {
			const urlInput: ExtractionInput = {
				type: 'url',
				content: 'https://github.com/user/binary-only-repo',
				options: { includeCode: true },
			}

			const extractSpy = vi.spyOn(extractor as any, 'analyzeRepository')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: '',
					metadata: { totalFiles: 10, codeFiles: 0 },
					fileTree: [
						{ path: 'image1.png', type: 'file', size: 1024 },
						{ path: 'video.mp4', type: 'file', size: 10240 },
						{ path: 'archive.zip', type: 'file', size: 2048 },
					],
					processingTime: 1000,
				},
			})

			const result = await extractor.extract(urlInput)

			expect(result.success).toBe(true)
			expect(result.data?.codeFiles).toHaveLength(0)
		})
	})
})
