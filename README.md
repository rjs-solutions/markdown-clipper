# SharePoint Markdown Exporter

A small Chrome extension for turning the active SharePoint page into Markdown.

## Actions

- Download Markdown: saves a `.md` file.
- Open Markdown Tab: opens the generated Markdown in a new extension tab.
- Copy Markdown: copies the same Markdown to the clipboard.

By default, the extension scrolls to the bottom of the page before it captures content so lazy-loaded SharePoint sections have a chance to render.

## Install Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select this folder: `sharepoint-markdown-exporter`.

## Options

Open the extension options page to adjust:

- Whether the page scrolls before capture.
- Whether page metadata is included at the top of the Markdown.
- Maximum scroll time, in milliseconds.
- Delay after each scroll step, in milliseconds.

## Notes

The extension uses Chrome's `activeTab` permission. It only injects the collector into the page after the user opens the extension popup and chooses an action.
