'use strict';

// A shared Marked block extension, used by both Hexo and the live preview.
// Native details/summary works without JavaScript, including in the preview sandbox.
const opening = /^ {0,3}:::(info|success)\[([^\]\n]*)\][ \t]*(?:\n|$)/;
const closing = /^ {0,3}:::[ \t]*$/;
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]);

module.exports = function foldContainers() {
  return {
    extensions: [{
      name: 'foldContainer',
      level: 'block',
      start(src) {
        const match = /(?:^|\n) {0,3}:::(?:info|success)\[[^\]\n]*\][ \t]*(?=\n|$)/.exec(src);
        if (match) return match.index + (match[0].startsWith('\n') ? 1 : 0);
      },
      tokenizer(src) {
        const match = opening.exec(src);
        if (!match) return;
        let depth = 1;
        let offset = match[0].length;
        let fence = null;
        // Match nested containers; do not treat ::: in fenced code as syntax.
        for (const line of src.slice(offset).split('\n')) {
          if (fence) {
            const end = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
            if (end && end[1][0] === fence.char && end[1].length >= fence.length) fence = null;
          } else {
            const beginFence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
            if (beginFence && (beginFence[1][0] !== '`' || !beginFence[2].includes('`'))) {
              fence = { char: beginFence[1][0], length: beginFence[1].length };
            } else if (opening.test(line)) {
              depth++;
            } else if (closing.test(line)) {
              depth--;
              if (depth === 0) {
                const end = Math.min(src.length, offset + line.length + 1);
                return {
                  type: 'foldContainer',
                  raw: src.slice(0, end),
                  kind: match[1],
                  title: match[2].trim() || (match[1] === 'info' ? '提示' : '成功'),
                  tokens: this.lexer.blockTokens(src.slice(match[0].length, offset), []),
                };
              }
            }
          }
          offset += line.length + 1;
        }
        // An unclosed block is ordinary Markdown; never swallow the rest of a post.
      },
      renderer(token) {
        return `<details class="fold-box fold-box--${token.kind}"><summary>${escape(token.title)}</summary><div class="fold-box-body">${this.parser.parse(token.tokens)}</div></details>\n`;
      },
      childTokens: ['tokens'],
    }],
  };
};
