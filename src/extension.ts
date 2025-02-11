// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { TodoPanelProvider } from './webview/todo-panel';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('TODO Tok extension is now active!');

	// Register the command to open the TODO Tok interface
	let disposable = vscode.commands.registerCommand('todo-tok.start', () => {
		TodoPanelProvider.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(disposable);

	// Register configuration
	vscode.workspace.getConfiguration('todotok').update('todoPattern', 'TODO:?', vscode.ConfigurationTarget.Global);
}

// This method is called when your extension is deactivated
export function deactivate() {}
