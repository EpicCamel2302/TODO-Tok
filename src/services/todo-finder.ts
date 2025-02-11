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

async function getGitAuthor(filePath: string, lineNumber: number): Promise<string | undefined> {
    try {
        // Get the workspace folder containing the file
        const workspaceFolder = vscode.workspace.workspaceFolders?.find(folder =>
            filePath.startsWith(folder.uri.fsPath)
        );

        if (!workspaceFolder) {
            return undefined;
        }

        // Run git blame for the specific line
        const { stdout } = await execAsync(
            `git blame -L ${lineNumber + 1},${lineNumber + 1} --porcelain "${filePath}"`,
            { cwd: workspaceFolder.uri.fsPath }
        );

        // Extract author from git blame output
        const authorMatch = stdout.match(/^author (.+)$/m);
        return authorMatch ? authorMatch[1] : undefined;
    } catch (error) {
        // Git command failed or git not available
        return undefined;
    }
}

export async function findTodos(): Promise<Todo[]> {
    try {
        const config = vscode.workspace.getConfiguration('todotok');
        const userPattern = config.get<string>('todoPattern');

        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showInformationMessage('TODO Tok: Please open a workspace or folder first.');
            return [];
        }

        const todoPattern = userPattern || '(?:TODO|TO-DO|TO_DO|FIXME|FIX-ME|FIX_ME|XXX|HACK|BUG|OPTIMIZE|REVIEW)';
        const todos: Todo[] = [];

        try {
            const files = await vscode.workspace.findFiles('**/*.*', '**/node_modules/**');

            if (files.length === 0) {
                vscode.window.showInformationMessage('TODO Tok: No files found in workspace.');
                return [];
            }

            for (const file of files) {
                try {
                    const document = await vscode.workspace.openTextDocument(file);
                    const text = document.getText();

                    const regex = new RegExp(
                        `(?:(?://|/\\*|\\*|#|<!--|"""|'''|--|%%|\\{-|\\(\\*|;)\\s*)(${todoPattern})(?:[:_-])?\\s*(.+?)\\s*(?:\\*/|-->|"""|'''|\\-\\}|\\*\\)|$)`,
                        'gim'
                    );

                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        if (match[1] && match[2]) { // Ensure we have both the type and text
                            const position = document.positionAt(match.index);
                            const endPosition = document.positionAt(match.index + match[0].length);

                            const todoType = match[1].toUpperCase().trim();
                            const todoText = match[2].trim();

                            // Get the author of the TODO
                            const author = await getGitAuthor(file.fsPath, position.line);

                            todos.push({
                                text: `[${todoType}] ${todoText}`,
                                file: file.fsPath,
                                line: position.line,
                                column: position.character,
                                range: new vscode.Range(position, endPosition),
                                author
                            });
                        }
                    }
                } catch (fileError) {
                    console.error(`Error processing file ${file.fsPath}:`, fileError);
                    // Continue with next file
                }
            }

            if (todos.length === 0) {
                vscode.window.showInformationMessage('TODO Tok: No TODOs found in workspace.');
            }

            return todos;

        } catch (filesError) {
            vscode.window.showErrorMessage('TODO Tok: Error searching workspace files. Please try again.');
            console.error('Error searching files:', filesError);
            return [];
        }

    } catch (error) {
        vscode.window.showErrorMessage('TODO Tok: An unexpected error occurred. Please check the logs.');
        console.error('Unexpected error in findTodos:', error);
        return [];
    }
}

export async function removeTodo(todo: Todo): Promise<boolean> {
    if (!todo || !todo.file || !todo.range) {
        vscode.window.showErrorMessage('TODO Tok: Invalid TODO item. Cannot remove.');
        return false;
    }

    try {
        const document = await vscode.workspace.openTextDocument(todo.file);
        const edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, todo.range);

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            vscode.window.showInformationMessage('TODO Tok: Successfully removed TODO.');
        } else {
            vscode.window.showWarningMessage('TODO Tok: Could not remove TODO. The file might be read-only.');
        }
        return success;
    } catch (error) {
        vscode.window.showErrorMessage('TODO Tok: Error removing TODO. Please try again.');
        console.error('Error removing TODO:', error);
        return false;
    }
}
