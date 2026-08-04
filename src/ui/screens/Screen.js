/**
 * Minimal screen base. Screens are plain DOM appended to #ui-root, shown one at
 * a time. No framework: the whole UI is a handful of static layouts, and a
 * dependency would cost more bytes than it saves lines.
 */
export class Screen {
  constructor(root, className = '') {
    this.root = root;
    this.el = document.createElement('div');
    this.el.className = `screen ${className}`.trim();
    this.el.hidden = true;
    root.appendChild(this.el);
    this.visible = false;
  }

  show() {
    this.el.hidden = false;
    this.visible = true;
    this.onShow?.();
  }

  hide() {
    this.el.hidden = true;
    this.visible = false;
    this.onHide?.();
  }

  dispose() {
    this.onHide?.();
    this.el.remove();
  }

  /** Tiny helper so screen layouts read as structure, not as DOM plumbing. */
  add(tag, cls, parent = this.el, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    parent.appendChild(n);
    return n;
  }

  button(label, cls, parent, onClick) {
    const b = this.add('button', `btn ${cls}`.trim(), parent, label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
}
