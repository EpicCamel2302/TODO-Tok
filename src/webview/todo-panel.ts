import * as vscode from 'vscode';
import { findTodos, removeTodo } from '../services/todo-finder';
import { TodoManager } from '../services/todo-manager';

export class TodoPanelProvider {
    public static currentPanel: TodoPanelProvider | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentTodoIndex: number = 0;
    private _todos: Awaited<ReturnType<typeof TodoManager.prototype.initializeStream>> = [];
    private _loading: boolean = false;
    private _todoManager: TodoManager;
    private _loadedAllTodos: boolean = false;
    private _statusListener: vscode.Disposable | undefined;
    private _showingAllTodosInFile: boolean = false;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._todoManager = TodoManager.getInstance();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Show loading state initially
        this._panel.webview.html = this._getLoadingContent();
        this._panel.webview.onDidReceiveMessage(this._handleMessage, this);

        // Setup status listener
        this._statusListener = this._todoManager.onStatusChange(status => {
            this._panel.webview.postMessage({
                command: 'updateStatus',
                status
            });
        });

        // Load initial batch of TODOs
        this._loadInitialTodos();
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (TodoPanelProvider.currentPanel) {
            TodoPanelProvider.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'todotok',
            'TODO Tok',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        TodoPanelProvider.currentPanel = new TodoPanelProvider(panel, extensionUri);
    }

    private async _loadInitialTodos() {
        try {
            this._loading = true;
            this._updateWebview();

            this._todos = await this._todoManager.initializeStream();

            if (!this._todos || this._todos.length === 0) {
                this._loading = false;
                this._panel.webview.html = this._getEmptyStateContent();
                return;
            }

            this._currentTodoIndex = 0;
            this._loadedAllTodos = this._todos.length < 20; // Assuming batch size is 20

            this._loading = false;
            this._updateWebview();

            // Start background status updates
            this._startBackgroundUpdates();
        } catch (error) {
            this._loading = false;
            console.error('Error loading TODOs:', error);
            this._panel.webview.html = this._getErrorContent('Failed to load TODOs. Please try again.');

            // Log the error if debug is enabled
            const config = vscode.workspace.getConfiguration('todotok');
            if (config.get<boolean>('debug')) {
                console.error('Detailed error:', error);
            }
        }
    }

    private _startBackgroundUpdates() {
        const interval = setInterval(async () => {
            if (!this._todoManager.isStillProcessing()) {
                clearInterval(interval);
                return;
            }

            const totalCount = this._todoManager.getTotalCount();
            if (totalCount > this._todos.length) {
                // Update progress in the UI
                this._panel.webview.postMessage({
                    command: 'updateProgress',
                    data: {
                        current: this._todos.length,
                        total: totalCount
                    }
                });
            }
        }, 1000);
    }

    private async _loadMoreTodos() {
        if (this._loadedAllTodos || this._loading) {
            return;
        }

        try {
            const nextBatch = await this._todoManager.getNextBatch(this._todos.length);
            if (nextBatch.length === 0) {
                this._loadedAllTodos = true;
                return;
            }

            this._todos = [...this._todos, ...nextBatch];
            this._updateWebview();
        } catch (error) {
            console.error('Error loading more TODOs:', error);
        }
    }

    private _handleMessage = async (message: any) => {
        try {
            switch (message.command) {
                case 'next':
                    if (this._currentTodoIndex < this._todos.length - 1) {
                        this._currentTodoIndex++;
                        this._updateWebview();

                        // Load more TODOs if we're near the end
                        if (this._currentTodoIndex >= this._todos.length - 5) {
                            await this._loadMoreTodos();
                        }
                    }
                    break;
                case 'previous':
                    if (this._currentTodoIndex > 0) {
                        this._currentTodoIndex--;
                        this._updateWebview();
                    }
                    break;
                case 'complete':
                    if (this._todos[this._currentTodoIndex]) {
                        const success = await removeTodo(this._todos[this._currentTodoIndex]);
                        if (success) {
                            await this._loadInitialTodos();
                        }
                    }
                    break;
                case 'openFile':
                    if (this._todos[this._currentTodoIndex]) {
                        try {
                            const todo = this._todos[this._currentTodoIndex];
                            const document = await vscode.workspace.openTextDocument(todo.file);
                            await vscode.window.showTextDocument(document, {
                                selection: todo.range
                            });
                        } catch (error) {
                            vscode.window.showErrorMessage('TODO Tok: Failed to open file. The file might have been moved or deleted.');
                            console.error('Error opening file:', error);
                        }
                    }
                    break;
                case 'refresh':
                    await this._loadInitialTodos();
                    break;
                case 'toggleFileTodos':
                    this._showingAllTodosInFile = !this._showingAllTodosInFile;
                    this._updateWebview();
                    break;
                case 'selectTodoInFile':
                    const currentTodo = this._todos[this._currentTodoIndex];
                    const todosInFile = this._todoManager.getTodosInFile(currentTodo.file);
                    const selectedTodo = todosInFile[message.index];
                    if (selectedTodo) {
                        // Find the index of this todo in the main todos array
                        const mainIndex = this._todos.findIndex(todo =>
                            todo.file === selectedTodo.file &&
                            todo.line === selectedTodo.line &&
                            todo.column === selectedTodo.column
                        );
                        if (mainIndex !== -1) {
                            this._currentTodoIndex = mainIndex;
                            this._updateWebview();
                        }
                    }
                    break;
            }
        } catch (error) {
            vscode.window.showErrorMessage('TODO Tok: An error occurred while processing your request.');
            console.error('Error handling message:', error);
        }
    };

    private _updateWebview() {
        if (this._loading) {
            this._panel.webview.html = this._getLoadingContent();
            return;
        }

        if (!this._todos || this._todos.length === 0) {
            this._panel.webview.html = this._getEmptyStateContent();
            return;
        }

        const currentTodo = this._todos[this._currentTodoIndex];
        if (!currentTodo) {
            this._panel.webview.html = this._getEmptyStateContent();
            return;
        }

        this._panel.webview.html = this._getWebviewContent();
    }

    private _getLoadingContent(): string {
        return `<!DOCTYPE html>
        <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        text-align: center;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                    }
                    .loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 20px;
                    }
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #007acc;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading TODOs...</p>
                </div>
            </body>
        </html>`;
    }

    private _getErrorContent(message: string): string {
        return `<!DOCTYPE html>
        <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        text-align: center;
                        color: var(--vscode-errorForeground);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                    }
                    .error {
                        background: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        padding: 20px;
                        border-radius: 4px;
                        max-width: 80%;
                    }
                    .refresh-button {
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }
                    .refresh-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>Error</h2>
                    <p>${message}</p>
                    <button class="refresh-button" onclick="refresh()">Try Again</button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    function refresh() {
                        vscode.postMessage({ command: 'refresh' });
                    }
                </script>
            </body>
        </html>`;
    }

    private _getEmptyStateContent(): string {
        return `<!DOCTYPE html>
        <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        text-align: center;
                    }
                    .empty-state {
                        margin-top: 40px;
                    }
                </style>
            </head>
            <body>
                <div class="empty-state">
                    <h2>No TODOs Found</h2>
                    <p>Great job! You've completed all your TODOs.</p>
                </div>
            </body>
        </html>`;
    }

    private _getWebviewContent(): string {
        const currentTodo = this._todos[this._currentTodoIndex];
        if (!currentTodo) {
            return this._getEmptyStateContent();
        }

        const config = vscode.workspace.getConfiguration('todotok');
        const centerButtons = config.get<boolean>('centerNavigationButtons');
        const enableScroll = config.get<boolean>('enableScrollNavigation');
        const todosInFile = this._todoManager.getTodoCountInFile(currentTodo.file);
        const showingAllTodos = this._showingAllTodosInFile;

        return `<!DOCTYPE html>
        <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        margin: 0;
                    }
                    .controls {
                        padding: 10px;
                        ${centerButtons ? 'display: flex; justify-content: center;' : ''}
                    }
                    .nav-button {
                        padding: 10px 20px;
                        margin: 5px;
                        cursor: pointer;
                        background: #007acc;
                        color: white;
                        border: none;
                        border-radius: 4px;
                    }
                    .nav-button:disabled {
                        background: #ccc;
                        cursor: not-allowed;
                    }
                    .todo-container {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                        text-align: center;
                        ${enableScroll ? 'cursor: ns-resize;' : ''}
                    }
                    .todo-text {
                        font-size: 1.5em;
                        margin: 20px 0;
                    }
                    .file-info {
                        color: #666;
                        margin-bottom: 20px;
                    }
                    .meta-info {
                        color: #666;
                        font-size: 0.9em;
                        margin-top: 10px;
                        padding: 10px;
                        background: #f3f3f3;
                        border-radius: 4px;
                    }
                    .progress-info {
                        color: #666;
                        font-size: 0.8em;
                        margin-top: 10px;
                        text-align: center;
                    }
                    .loading-indicator {
                        display: inline-block;
                        width: 10px;
                        height: 10px;
                        border: 2px solid #007acc;
                        border-radius: 50%;
                        border-top-color: transparent;
                        animation: spin 1s linear infinite;
                        margin-left: 5px;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    .status-indicator {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        padding: 8px 12px;
                        background: rgba(0, 122, 204, 0.1);
                        border: 1px solid rgba(0, 122, 204, 0.2);
                        border-radius: 4px;
                        font-size: 12px;
                        color: var(--vscode-foreground);
                        max-width: 300px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    }
                    .status-indicator.visible {
                        opacity: 1;
                    }
                    .status-indicator .spinner {
                        display: inline-block;
                        width: 10px;
                        height: 10px;
                        border: 2px solid var(--vscode-foreground);
                        border-radius: 50%;
                        border-top-color: transparent;
                        animation: spin 1s linear infinite;
                        margin-right: 6px;
                        vertical-align: middle;
                    }
                    .file-todos-info {
                        background: var(--vscode-badge-background);
                        color: var(--vscode-badge-foreground);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 0.9em;
                        margin: 10px 0;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                    }
                    .file-todos-info:hover {
                        opacity: 0.8;
                    }
                    .file-todos-list {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 4px;
                        padding: 10px;
                        margin: 10px 0;
                        max-height: 300px;
                        overflow-y: auto;
                        display: none;
                    }
                    .file-todos-list.visible {
                        display: block;
                    }
                    .todo-item {
                        padding: 8px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        cursor: pointer;
                    }
                    .todo-item:last-child {
                        border-bottom: none;
                    }
                    .todo-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .todo-item.current {
                        background: var(--vscode-list-activeSelectionBackground);
                        color: var(--vscode-list-activeSelectionForeground);
                    }
                    .line-number {
                        color: var(--vscode-editorLineNumber-foreground);
                        margin-right: 8px;
                        font-family: monospace;
                    }
                </style>
            </head>
            <body>
                <div id="statusIndicator" class="status-indicator">
                    <span class="spinner"></span>
                    <span id="statusText">Initializing...</span>
                </div>

                <div class="controls">
                    <button class="nav-button"
                        onclick="navigate('previous')"
                        ${this._currentTodoIndex === 0 ? 'disabled' : ''}>
                        ⬆️ Previous
                    </button>
                </div>

                <div class="todo-container" id="todoContainer">
                    <div class="todo-text">${currentTodo.text || 'No text available'}</div>
                    <div class="file-info">
                        <div>File: ${vscode.workspace.asRelativePath(currentTodo.file) || 'Unknown file'}</div>
                        <div>Line: ${(currentTodo.line !== undefined ? currentTodo.line + 1 : 'Unknown')}</div>
                        ${todosInFile > 1 ? `
                            <div class="file-todos-info" onclick="toggleFileTodos()">
                                <span>📑 ${todosInFile} TODOs in this file</span>
                                <span style="font-size: 0.8em">${showingAllTodos ? '(hide)' : '(show all)'}</span>
                            </div>
                        ` : ''}
                    </div>
                    ${todosInFile > 1 ? `
                        <div class="file-todos-list ${showingAllTodos ? 'visible' : ''}" id="fileTodosList">
                            ${this._todoManager.getTodosInFile(currentTodo.file).map((todo, index) => `
                                <div class="todo-item ${todo === currentTodo ? 'current' : ''}"
                                     onclick="selectTodo(${index})">
                                    <span class="line-number">Line ${todo.line + 1}:</span>
                                    ${todo.text}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    <div class="meta-info">
                        ${currentTodo.author ? `Created by: ${currentTodo.author}` : ''}
                    </div>
                    <button class="nav-button" onclick="openFile()">
                        Open File
                    </button>
                    <button class="nav-button" onclick="complete()">
                        Mark Complete
                    </button>
                </div>

                <div class="controls">
                    <button class="nav-button"
                        onclick="navigate('next')"
                        ${this._currentTodoIndex === this._todos.length - 1 ? 'disabled' : ''}>
                        ⬇️ Next
                    </button>
                </div>

                ${this._todoManager.isStillProcessing() ? `
                    <div class="progress-info">
                        Loading TODOs... (${this._todos.length}/${this._todoManager.getTotalCount()})
                        <span class="loading-indicator"></span>
                    </div>
                ` : ''}

                <script>
                    const vscode = acquireVsCodeApi();
                    const statusIndicator = document.getElementById('statusIndicator');
                    const statusText = document.getElementById('statusText');
                    const todoContainer = document.getElementById('todoContainer');
                    const fileTodosList = document.getElementById('fileTodosList');
                    const enableScroll = ${enableScroll};

                    if (enableScroll) {
                        let touchStartY = 0;
                        let touchEndY = 0;

                        // Mouse wheel navigation
                        document.addEventListener('wheel', (event) => {
                            if (event.deltaY > 0) {
                                navigate('next');
                            } else if (event.deltaY < 0) {
                                navigate('previous');
                            }
                        });

                        // Touch navigation
                        todoContainer.addEventListener('touchstart', (event) => {
                            touchStartY = event.touches[0].clientY;
                        });

                        todoContainer.addEventListener('touchend', (event) => {
                            touchEndY = event.changedTouches[0].clientY;
                            const deltaY = touchEndY - touchStartY;

                            if (Math.abs(deltaY) > 50) { // Minimum swipe distance
                                if (deltaY < 0) {
                                    navigate('next');
                                } else {
                                    navigate('previous');
                                }
                            }
                        });
                    }

                    function navigate(direction) {
                        vscode.postMessage({ command: direction });
                    }

                    function complete() {
                        vscode.postMessage({ command: 'complete' });
                    }

                    function openFile() {
                        vscode.postMessage({ command: 'openFile' });
                    }

                    function toggleFileTodos() {
                        vscode.postMessage({ command: 'toggleFileTodos' });
                    }

                    function selectTodo(index) {
                        vscode.postMessage({ command: 'selectTodoInFile', index });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'updateProgress') {
                            const progressInfo = document.querySelector('.progress-info');
                            if (progressInfo) {
                                progressInfo.textContent =
                                    \`Loading TODOs... (\${message.data.current}/\${message.data.total})\`;
                            }
                        } else if (message.command === 'updateStatus') {
                            const status = message.status;
                            if (status.state === 'searching') {
                                statusIndicator.classList.add('visible');
                                const fileInfo = status.currentFile ?
                                    \`Checking: \${status.currentFile}\` :
                                    'Searching for files';
                                statusText.textContent = \`\${fileInfo} (\${status.filesProcessed}/\${status.totalFiles})\`;
                            } else if (status.state === 'complete') {
                                setTimeout(() => {
                                    statusIndicator.classList.remove('visible');
                                }, 2000);
                                statusText.textContent = 'Search complete';
                            }
                        }
                    });
                </script>
            </body>
        </html>`;
    }

    public dispose() {
        TodoPanelProvider.currentPanel = undefined;

        // Clean up all disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        // Clean up status listener
        if (this._statusListener) {
            this._statusListener.dispose();
        }

        // Dispose the panel last
        this._panel.dispose();
    }
}
