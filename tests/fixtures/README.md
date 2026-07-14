# Fixture pages

`pages/*.html` are real saved pages used as golden-file input for
`tests/markdown-fixtures.test.js`. Each `pages/<name>.html` is converted with
`htmlToMarkdown` and compared byte-for-byte against `golden/<name>.md`.

## Regenerating goldens

After an intentional change to `extension/src/lib/markdown.js`, regenerate the
goldens instead of hand-editing them:

```
UPDATE_GOLDENS=1 node --test tests/markdown-fixtures.test.js
```

Then **read the regenerated `golden/*.md` files** before committing. A golden
that merely locks in bad output (garbage tables, dropped content, HTML soup)
is a failed change, not a passing test.
