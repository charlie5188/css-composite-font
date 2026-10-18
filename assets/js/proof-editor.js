// The proof keeps its real styled glyphs while editing. Store selection as text offsets so
// baseline-span redraws and asynchronous font loads cannot move the caret or corrupt IME input.
let composing = false;
function plainText(element) {
  if (!element.textContent && element.querySelectorAll?.('br').length === 1) return '';
  let text = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) { text += child.data; continue; }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (child.tagName === 'BR') { if (!child.hasAttribute('data-proof-tail')) text += '\n'; continue; }
    const block = /^(DIV|P|LI)$/.test(child.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    text += plainText(child);
    if (block && child.nextSibling && !text.endsWith('\n')) text += '\n';
  }
  return text;
}
const selectionOf = element => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return null;
  const offset = (node, at) => { const range = document.createRange(); range.selectNodeContents(element); range.setEnd(node, at); return plainText(range.cloneContents()).length; };
  return { anchor: offset(selection.anchorNode, selection.anchorOffset), focus: offset(selection.focusNode, selection.focusOffset) };
};
function restoreSelection(element, saved) {
  if (!saved) return;
  const point = offset => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
    return [element, element.childNodes.length];
  };
  window.getSelection().setBaseAndExtent(...point(saved.anchor), ...point(saved.focus));
}
export function redrawProof(element, render) {
  if (composing) return;
  const saved = document.activeElement === element ? selectionOf(element) : null;
  render();
  // A terminal newline needs one empty line box to keep the caret visible; it adds no text.
  if (!element.textContent || element.textContent.endsWith('\n')) { const tail = document.createElement('br'); tail.dataset.proofTail = ''; element.append(tail); }
  restoreSelection(element, saved);
}
export function initProofEditor(element, { getText, getKey, commit, redraw }) {
  if (element.contentEditable !== 'plaintext-only') element.contentEditable = 'true';
  let key, history = [], position = -1, before, lastType = '', lastTime = 0;
  const snapshot = () => ({ text: getText(), selection: selectionOf(element) });
  const reset = () => {
    if (key === getKey() && history[position]?.text === getText()) return;
    key = getKey(); history = [snapshot()]; position = 0; lastType = '';
  };
  const publish = (type = '') => {
    if (composing) return;
    const text = plainText(element);
    if (text === getText()) return;
    reset();
    const selection = selectionOf(element), now = performance.now();
    const group = type === lastType && ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(type) && now - lastTime < 1000 && before?.anchor === before?.focus && before?.focus === history[position]?.selection?.focus;
    history.splice(position + 1);
    commit(text); key = getKey();
    const next = { text, selection };
    if (group && position > 0) history[position] = next;
    else { history.push(next); position++; if (history.length > 100) { history.shift(); position--; } }
    lastType = type; lastTime = now;
  };
  const undo = direction => {
    reset(); const next = position + direction;
    if (!history[next]) return;
    position = next; const saved = history[position];
    commit(saved.text); key = getKey(); restoreSelection(element, saved.selection); lastType = '';
  };
  const insert = text => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return;
    reset(); before = selectionOf(element);
    const range = selection.getRangeAt(0); range.deleteContents();
    const node = document.createTextNode(text.replace(/\r\n?/g, '\n')); range.insertNode(node);
    selection.setBaseAndExtent(node, node.length, node, node.length);
    publish('insertFromPaste');
  };
  element.addEventListener('focus', reset);
  element.addEventListener('beforeinput', event => {
    if (composing || event.isComposing) return;
    reset(); before = selectionOf(element);
    if (history.length === 1) history[0].selection = before;
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyUndo' ? -1 : 1); }
    else if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) { event.preventDefault(); insert('\n'); }
    else if (event.inputType.startsWith('format')) event.preventDefault();
  });
  element.addEventListener('input', event => { if (!event.isComposing) publish(event.inputType); });
  element.addEventListener('compositionstart', () => { reset(); before = selectionOf(element); composing = true; });
  element.addEventListener('compositionend', () => {
    composing = false;
    if (plainText(element) === getText()) redraw(); // Cancelled composition still needs styled spans restored, without forking a tab.
    else publish('insertCompositionText');
  });
  element.addEventListener('paste', event => { event.preventDefault(); const text = event.clipboardData?.getData('text/plain'); if (text) insert(text); });
  // Plain text only, including in browsers without contenteditable="plaintext-only" support.
  element.addEventListener('drop', event => { event.preventDefault(); });
  element.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); event.stopPropagation(); undo(event.shiftKey || event.key.toLowerCase() === 'y' ? 1 : -1);
    }
  });
}
