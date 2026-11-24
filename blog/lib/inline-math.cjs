'use strict';
// Normalize multiline inline math before Marked splits paragraphs, without touching code or display math.
module.exports = function preprocessInlineMath(text) {
  let out = '', i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (i === 0 || text[i - 1] === '\n') {
      const fence = rest.match(/^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/);
      if (fence) {
        const marker = fence[1];
        const close = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}\\s*(?:\\n|$)', 'm');
        const end = close.exec(rest.slice(fence[0].length));
        const length = end ? fence[0].length + end.index + end[0].length : rest.length;
        out += rest.slice(0, length); i += length; continue;
      }
      const indent = rest.match(/^(?: {4}|\t)[^\n]*(?:\n|$)/);
      if (indent) { out += indent[0]; i += indent[0].length; continue; }
    }
    if (text[i] === '\\' && i + 1 < text.length) { out += text.slice(i, i + 2); i += 2; continue; }
    if (text[i] === '`') {
      const ticks = rest.match(/^`+/)[0];
      const end = text.indexOf(ticks, i + ticks.length);
      if (end !== -1) { out += text.slice(i, end + ticks.length); i = end + ticks.length; continue; }
    }
    if (text[i] === '$') {
      const display = text[i + 1] === '$';
      const delimiter = display ? '$$' : '$';
      let j = i + delimiter.length;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '`') break;
        if (text.startsWith(delimiter, j) && (display || text[j + 1] !== '$')) break;
        j++;
      }
      if (j < text.length && text.startsWith(delimiter, j)) {
        let content = text.slice(i + delimiter.length, j);
        let end = j + delimiter.length;
        // Marked's display-math rule requires the delimiter to be immediately
        // followed by a newline. Markdown authors often leave spaces after $$;
        // normalize only standalone delimiter lines, never inline $$ or code.
        if (display && (i === 0 || text[i - 1] === '\n') && /^(?:[ \t]*\r?\n)/.test(content)
          && /\n[ \t]*$/.test(content)) {
          const closingSpace = text.slice(end).match(/^[ \t]*(?=\r?\n|$)/);
          if (closingSpace) {
            content = content.replace(/^[ \t]+(?=\r?\n)/, '').replace(/\n[ \t]+$/, '\n');
            end += closingSpace[0].length;
          }
        }
        out += delimiter + (!display ? content.replace(/\r?\n/g, ' ') : content) + delimiter;
        i = end; continue;
      }
    }
    out += text[i++];
  }
  return out;
};
