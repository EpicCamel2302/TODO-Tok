# TODO Tok

Got too many TODOs? Got no attention span?

TODO Tok is the Gen Z certified way to manage your TODOs. Put your doomscrolling to good use and actually finish those projects you've been putting off for 18 months. With a TikTok-style interface, you can swipe through your TODOs, FixMe's, and Hacks, and fix them one by one (Or just send them to your AI agent of choice, this is the future oh boy).

Your CTO will love you. You'll have more friends. Your family will actually talk to you. What are you waiting for?

<sub>TODO Tok is not affiliated with TikTok, but if they're cool with it, we're cool with it. By using this extension, you agree to release us from all liability and hold us harmless (especially if you break production, I ain't dealing with all that). TODO Tok is not responsible for any damage to your codebase, your sanity, or your social life. Fix responsibly.</sub>

## Features

- 🎵 TikTok-style interface for browsing TODOs
- ⬆️ Navigate between TODOs with previous/next buttons
- 📝 View TODO details including file location and line number
- 🔍 Jump directly to TODO locations in your code
- ✅ Mark TODOs as complete and remove them from your codebase
- ⚙️ Configurable TODO pattern matching
- 🔄 Support for multiple TODO formats and comment styles

## Supported TODO Formats

By default, the extension recognizes the following TODO markers:
- `TODO`, `TO-DO`, `TO_DO`
- `FIXME`, `FIX-ME`, `FIX_ME`
- `XXX`
- `HACK`
- `BUG`
- `OPTIMIZE`
- `REVIEW`

## Supported Comment Styles

The extension recognizes TODOs in various comment formats:
```javascript
// TODO: Single-line comment
/* TODO: Multi-line comment */
# TODO: Hash comment (Python, Ruby, etc.)
<!-- TODO: HTML/XML comment -->
""" TODO: Python docstring """
''' TODO: Python/Ruby multiline string '''
-- TODO: SQL/Haskell comment
%% TODO: Matlab/Octave comment
{- TODO: Haskell block comment -}
(* TODO: OCaml comment *)
; TODO: Lisp/Clojure comment
```
Or if you're feeling extra creative, you can use any valid regular expression pattern to match TODOs in your code.

## Installation

1. Download the `.vsix` file from the releases page
2. Open VS Code
3. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
4. Type "Install from VSIX" and select the command
5. Choose the downloaded `.vsix` file

## Usage

1. Open a workspace containing TODO comments
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Type "TODO Tok: Start Browsing TODOs" and press Enter
4. Use the up/down buttons to navigate through your TODOs
5. Click "Open File" to jump to the TODO in your editor
6. Click "Mark Complete" to remove a TODO when you're done

## Configuration

You can customize the TODO pattern matching through VS Code settings:

1. Open VS Code settings (`Cmd+,` on Mac or `Ctrl+,` on Windows/Linux)
2. Search for "TODO Tok"
3. Modify the "todotok.todoPattern" setting with your preferred pattern
   - Default pattern matches common TODO formats (TODO, FIXME, etc.)
   - Use any valid regular expression pattern to customize matching
   - The pattern is case-insensitive by default

## Examples

The extension will find TODOs in various formats:

```javascript
// TODO: Implement error handling
/* FIXME Add validation */
# BUG Fix this issue
<!-- REVIEW: Check accessibility -->
/** TODO_OPTIMIZE: Improve performance */
// HACK: Temporary workaround
/* XXX: Need to refactor this */
```

## Requirements

- VS Code version 1.97.0 or higher

## Extension Settings

This extension contributes the following settings:

* `todotok.todoPattern`: Regular expression pattern to match TODOs in your code (default: "TODO:?")

## Known Issues

None at the moment. Please report any issues on the GitHub repository.

## Release Notes

### 0.0.1

Initial release of TODO Tok:
- Basic TODO navigation
- File jumping
- TODO completion
- Configurable TODO patterns

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
