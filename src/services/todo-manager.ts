import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface Todo {
    text: string;
    file: string;
    line: number;
    column: number;
    range: vscode.Range;
    author?: string;
}

interface FileCache {
    lastChecked: number;
    lastModified: number;
}

interface ProcessingStatus {
    currentFile?: string;
    filesProcessed: number;
    totalFiles: number;
    state: 'idle' | 'searching' | 'complete';
}

interface TodosByFile {
    [filePath: string]: Todo[];
}

export class TodoManager {
    private static instance: TodoManager | undefined;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private fileCache: Map<string, FileCache> = new Map();
    private processedFiles: Set<string> = new Set();
    private todos: Todo[] = [];
    private todosByFile: TodosByFile = {};
    private isProcessing: boolean = false;
    private batchSize: number = 20;
    private todoPattern: string = '';
    private outputChannel!: vscode.OutputChannel;
    private status: ProcessingStatus = {
        filesProcessed: 0,
        totalFiles: 0,
        state: 'idle'
    };
    private statusListeners: ((status: ProcessingStatus) => void)[] = [];

    private constructor() {
        this.initialize();
    }

    private initialize() {
        const config = vscode.workspace.getConfiguration('todotok');
        this.todoPattern = config.get<string>('todoPattern') || '(?:TODO|TO-DO|TO_DO|FIXME|FIX-ME|FIX_ME|XXX|HACK|BUG|OPTIMIZE|REVIEW)';
        this.outputChannel = vscode.window.createOutputChannel('TODO Tok');
        this.todos = [];
        this.processedFiles.clear();
        this.fileCache.clear();
        this.isProcessing = false;
        this.status = {
            filesProcessed: 0,
            totalFiles: 0,
            state: 'idle'
        };

        if (config.get<boolean>('debug')) {
            this.log('TodoManager initialized');
        }

        this.setupFileWatcher();
    }

    private log(message: string) {
        const config = vscode.workspace.getConfiguration('todotok');
        if (config.get<boolean>('debug')) {
            const timestamp = new Date().toISOString();
            this.outputChannel.appendLine(`[${timestamp}] ${message}`);
        }
    }

    public static getInstance(): TodoManager {
        if (!TodoManager.instance) {
            TodoManager.instance = new TodoManager();
        } else {
            // Reinitialize if instance exists but was disposed
            TodoManager.instance.initialize();
        }
        return TodoManager.instance;
    }

    private setupFileWatcher() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }

        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.*', false, false, false);

        this.fileWatcher.onDidChange(async uri => {
            const filePath = uri.fsPath;
            this.fileCache.delete(filePath);
            this.processedFiles.delete(filePath);
            // If this file had TODOs, trigger a refresh
            if (this.todos.some(todo => todo.file === filePath)) {
                await this.refreshTodos();
            }
        });

        this.fileWatcher.onDidDelete(uri => {
            const filePath = uri.fsPath;
            this.fileCache.delete(filePath);
            this.processedFiles.delete(filePath);
            this.todos = this.todos.filter(todo => todo.file !== filePath);
        });
    }

    private async getGitAuthor(filePath: string, lineNumber: number): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('todotok');
        if (!config.get<boolean>('enableGitBlame')) {
            return undefined;
        }

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder =>
                filePath.startsWith(folder.uri.fsPath)
            );

            if (!workspaceFolder) {
                return undefined;
            }

            this.log(`Getting git blame for ${filePath}:${lineNumber + 1}`);
            const { stdout } = await execAsync(
                `git blame -L ${lineNumber + 1},${lineNumber + 1} --porcelain "${filePath}"`,
                { cwd: workspaceFolder.uri.fsPath }
            );

            const authorMatch = stdout.match(/^author (.+)$/m);
            return authorMatch ? authorMatch[1] : undefined;
        } catch (error) {
            this.log(`Git blame failed for ${filePath}:${lineNumber + 1} - ${error}`);
            return undefined;
        }
    }

    public onStatusChange(listener: (status: ProcessingStatus) => void): vscode.Disposable {
        this.statusListeners.push(listener);
        return {
            dispose: () => {
                const index = this.statusListeners.indexOf(listener);
                if (index > -1) {
                    this.statusListeners.splice(index, 1);
                }
            }
        };
    }

    private updateStatus(update: Partial<ProcessingStatus>) {
        this.status = { ...this.status, ...update };
        this.statusListeners.forEach(listener => listener(this.status));
    }

    public async initializeStream(): Promise<Todo[]> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('TODO Tok: Please open a workspace or folder first.');
            return [];
        }

        this.todos = [];
        this.processedFiles.clear();
        this.isProcessing = true;
        this.updateStatus({ state: 'searching', filesProcessed: 0 });

        try {
            const config = vscode.workspace.getConfiguration('todotok');
            const includeGlobs = config.get<string[]>('includeGlobs') || ['**/*'];
            const excludeGlobs = config.get<string[]>('excludeGlobs') || ['**/node_modules/**'];

            this.log(`Searching with include patterns: ${includeGlobs.join(', ')}`);
            this.log(`Excluding patterns: ${excludeGlobs.join(', ')}`);

            // Process each include glob pattern
            let allFiles: vscode.Uri[] = [];
            for (const includeGlob of includeGlobs) {
                const files = await vscode.workspace.findFiles(includeGlob, `{${excludeGlobs.join(',')}}`);
                allFiles = allFiles.concat(files);
            }

            // Remove duplicates
            allFiles = Array.from(new Set(allFiles.map(f => f.toString()))).map(f => vscode.Uri.parse(f));

            this.log(`Found ${allFiles.length} files to process`);
            this.updateStatus({ totalFiles: allFiles.length });

            const initialBatch = await this.processBatch(allFiles.slice(0, this.batchSize));

            if (allFiles.length > this.batchSize) {
                this.processRemainingFiles(allFiles.slice(this.batchSize));
            } else {
                this.updateStatus({ state: 'complete' });
            }

            return initialBatch;
        } catch (error) {
            this.log(`Error initializing TODO stream: ${error}`);
            console.error('Error initializing TODO stream:', error);
            this.updateStatus({ state: 'complete' });
            return [];
        }
    }

    private async processRemainingFiles(files: vscode.Uri[]) {
        for (let i = 0; i < files.length; i += this.batchSize) {
            const batch = files.slice(i, i + this.batchSize);
            await this.processBatch(batch);
        }
        this.isProcessing = false;
        this.updateStatus({ state: 'complete', currentFile: undefined });
    }

    private async processBatch(files: vscode.Uri[]): Promise<Todo[]> {
        const newTodos: Todo[] = [];

        for (const file of files) {
            if (this.processedFiles.has(file.fsPath)) {
                this.updateStatus({ filesProcessed: this.status.filesProcessed + 1 });
                continue;
            }

            try {
                this.updateStatus({
                    currentFile: vscode.workspace.asRelativePath(file.fsPath),
                    filesProcessed: this.status.filesProcessed + 1
                });

                const stats = await vscode.workspace.fs.stat(file);
                const cached = this.fileCache.get(file.fsPath);

                if (cached && cached.lastModified === stats.mtime) {
                    this.processedFiles.add(file.fsPath);
                    continue;
                }

                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                const fileTodos: Todo[] = [];

                const regex = new RegExp(
                    `(?:(?://|/\\*|\\*|#|<!--|"""|'''|--|%%|\\{-|\\(\\*|;)\\s*)(${this.todoPattern})(?:[:_-])?\\s*(.+?)\\s*(?:\\*/|-->|"""|'''|\\-\\}|\\*\\)|$)`,
                    'gim'
                );

                let match;
                while ((match = regex.exec(text)) !== null) {
                    if (match[1] && match[2]) {
                        const position = document.positionAt(match.index);
                        const endPosition = document.positionAt(match.index + match[0].length);
                        const todoType = match[1].toUpperCase().trim();
                        const todoText = match[2].trim();
                        const author = await this.getGitAuthor(file.fsPath, position.line);

                        const todo: Todo = {
                            text: `[${todoType}] ${todoText}`,
                            file: file.fsPath,
                            line: position.line,
                            column: position.character,
                            range: new vscode.Range(position, endPosition),
                            author
                        };

                        newTodos.push(todo);
                        this.todos.push(todo);
                        fileTodos.push(todo);
                    }
                }

                if (fileTodos.length > 0) {
                    this.todosByFile[file.fsPath] = fileTodos;
                }

                this.fileCache.set(file.fsPath, {
                    lastChecked: Date.now(),
                    lastModified: stats.mtime
                });
                this.processedFiles.add(file.fsPath);

            } catch (error) {
                console.error(`Error processing file ${file.fsPath}:`, error);
            }
        }

        return newTodos;
    }

    public async getNextBatch(startIndex: number): Promise<Todo[]> {
        const end = Math.min(startIndex + this.batchSize, this.todos.length);
        return this.todos.slice(startIndex, end);
    }

    public getTotalCount(): number {
        return this.todos.length;
    }

    public isStillProcessing(): boolean {
        return this.isProcessing;
    }

    public async refreshTodos(): Promise<void> {
        this.todos = [];
        this.processedFiles.clear();
        this.fileCache.clear();
        await this.initializeStream();
    }

    public getStatus(): ProcessingStatus {
        return this.status;
    }

    public getTodosInFile(filePath: string): Todo[] {
        return this.todosByFile[filePath] || [];
    }

    public getTodoCountInFile(filePath: string): number {
        return this.todosByFile[filePath]?.length || 0;
    }

    public dispose() {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
        this.statusListeners = [];
        this.outputChannel.dispose();
        this.todos = [];
        this.todosByFile = {};
        this.processedFiles.clear();
        this.fileCache.clear();
        this.isProcessing = false;
        TodoManager.instance = undefined;
    }
}
