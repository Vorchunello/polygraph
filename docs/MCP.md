# Polygraph for AI agents (MCP)

`mcp/server.mjs` is a [Model Context Protocol](https://modelcontextprotocol.io) server. It lets Claude Code, Claude Desktop or any other MCP client read and update your Polygraph vault — so a tutoring session knows your words, traps, inbox, notes and goal instead of starting from zero.

It works directly with the Markdown files; the app does not need to be running.

## Set up

You need Node.js 18+ and a checkout of this repository (`npm install` once).

```bash
claude mcp add polygraph -- node /path/to/polygraph/mcp/server.mjs
```

The server finds your vault in this order:

1. the `POLYGRAPH_VAULT` environment variable;
2. the folder you chose in the desktop app (Settings → Data);
3. `Documents/Polygraph`.

To point it somewhere else:

```bash
claude mcp add polygraph -e POLYGRAPH_VAULT=/path/to/vault -- node /path/to/polygraph/mcp/server.mjs
```

## Tools

| Tool | What it does |
|---|---|
| `polygraph_profile` | Languages you know and learn, the active language, your goal |
| `polygraph_stats` | Words per language, due today, traps, study streak |
| `polygraph_due` | Words due for review today (plus a few new ones) with translations and bridges |
| `polygraph_search` | Find words by any spelling in any language, or by tag |
| `polygraph_word` | The full Markdown file of one word |
| `polygraph_add_word` | Add a word with translations (tagged `mcp`) |
| `polygraph_inbox` | Unprocessed words and questions you captured |
| `polygraph_add_to_inbox` | Put items into the inbox for later |
| `polygraph_notes` | Search your notes, or list them |

## Example: a study session in Claude Code

> Read my Polygraph profile and today's due words. Quiz me on the traps first, then explain the ones I get wrong through Russian. Add any new words that come up to my inbox.
