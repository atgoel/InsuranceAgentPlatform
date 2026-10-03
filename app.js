/* India Insurance Distribution Platform · static prototype runtime
   Renders the design screens (template + logic class) with React and hash routing. */
(function () {
  'use strict';
  var e = React.createElement;
  var SCREENS = window.SCREENS;
  var BOOL = { checked: 1, disabled: 1, selected: 1, hidden: 1, open: 1, readonly: 1, required: 1, multiple: 1, autofocus: 1 };
  var RENAME = { 'class': 'className', 'for': 'htmlFor', maxlength: 'maxLength', inputmode: 'inputMode', readonly: 'readOnly', tabindex: 'tabIndex',
    autocomplete: 'autoComplete', colspan: 'colSpan', rowspan: 'rowSpan', viewbox: 'viewBox', 'stroke-width': 'strokeWidth', 'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin', 'fill-rule': 'fillRule', 'clip-rule': 'clipRule' };
  var EVENTS = { onclick: 'onClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit', onkeydown: 'onKeyDown', onblur: 'onBlur', onfocus: 'onFocus' };
  var VOID = { input: 1, img: 1, br: 1, hr: 1, meta: 1, link: 1, source: 1, col: 1 };
  var HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;

  function literal(p) {
    if (p === 'true') return [true];
    if (p === 'false') return [false];
    if (p === 'null') return [null];
    if (/^-?\d+(\.\d+)?$/.test(p)) return [Number(p)];
    var m = p.match(/^'(.*)'$|^"(.*)"$/);
    if (m) return [m[1] !== undefined ? m[1] : m[2]];
    return null;
  }
  function look(p, scope) {
    var l = literal(p); if (l) return l[0];
    var parts = p.split('.'); var cur;
    if (parts[0] in scope.locals) cur = scope.locals[parts[0]]; else cur = scope.vals ? scope.vals[parts[0]] : undefined;
    for (var i = 1; i < parts.length; i++) { if (cur == null) return undefined; cur = cur[parts[i]]; }
    return cur;
  }
  function interp(str, scope) { return str.replace(HOLE, function (_, p) { var v = look(p, scope); return v == null ? '' : String(v); }); }
  function camel(prop) {
    if (prop.indexOf('--') === 0) return prop;
    return prop.replace(/^-(webkit|moz|ms)-/, function (_, v) { return v.charAt(0).toUpperCase() + v.slice(1) + '-'; }).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }
  function parseStyle(s) {
    var out = {};
    String(s || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':'); if (i < 0) return;
      var k = decl.slice(0, i).trim(); var v = decl.slice(i + 1).trim();
      if (k && v) out[camel(k)] = v;
    });
    return out;
  }

  // ---- compile template DOM into a node spec (once per screen)
  function compile(nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) {
        if (/^\s*$/.test(n.nodeValue) && n.nodeValue.indexOf('\n') >= 0) continue;
        out.push({ t: 'x', v: n.nodeValue });
      } else if (n.nodeType === 1) {
        var tag = n.localName;
        if (tag === 'sc-if') out.push({ t: 'if', c: (n.getAttribute('value') || '').replace(WHOLE, '$1'), k: compile(n.childNodes) });
        else if (tag === 'sc-for') out.push({ t: 'for', l: (n.getAttribute('list') || '').replace(WHOLE, '$1'), as: n.getAttribute('as') || 'item', k: compile(n.childNodes) });
        else {
          var attrs = [];
          for (var a = 0; a < n.attributes.length; a++) { var at = n.attributes[a]; if (at.name.indexOf('hint-') === 0) continue; attrs.push([at.name, at.value]); }
          out.push({ t: 'e', tag: tag, a: attrs, k: compile(tag === 'template' ? n.content.childNodes : n.childNodes) });
        }
      }
    }
    return out;
  }

  function scrollTo(id) { var el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function renderNode(n, scope, key) {
    if (n.t === 'x') return interp(n.v, scope);
    if (n.t === 'if') { var c = look(n.c, scope); return c ? e(React.Fragment, { key: key }, renderList(n.k, scope)) : null; }
    if (n.t === 'for') {
      var list = look(n.l, scope) || [];
      return e(React.Fragment, { key: key }, list.map(function (item, j) {
        var locals = Object.create(scope.locals); locals[n.as] = item; locals.$index = j;
        return e(React.Fragment, { key: j }, renderList(n.k, { vals: scope.vals, locals: locals }));
      }));
    }
    var props = { key: key }; var tag = n.tag;
    for (var i = 0; i < n.a.length; i++) {
      var name = n.a[i][0], raw = n.a[i][1];
      var whole = raw.match(WHOLE), hasHole = raw.indexOf('{{') >= 0, val;
      if (whole) val = look(whole[1], scope); else if (hasHole) val = interp(raw, scope); else val = raw;
      if (name === 'style') { props.style = parseStyle(val); continue; }
      var k = EVENTS[name] || RENAME[name] || name;
      if (BOOL[name]) {
        if (!hasHole) { val = true; if (name === 'checked') k = 'defaultChecked'; } else val = !!val;
      }
      if (name === 'value' && !hasHole && (tag === 'input' || tag === 'textarea' || tag === 'select')) k = 'defaultValue';
      if (name === 'href' && typeof val === 'string') {
        var m = val.match(/^(?:\.\/|\/)?([\w-]+)\.dc\.html$/);
        if (m) val = '#/' + m[1];
        else if (val === '#') { props.onClick = props.onClick || function (ev) { ev.preventDefault(); }; }
        else if (val.charAt(0) === '#' && val.charAt(1) !== '/') { (function (id) { props.onClick = function (ev) { ev.preventDefault(); scrollTo(id); }; })(val.slice(1)); }
        else if (/^https?:/.test(val)) { props.target = '_blank'; props.rel = 'noopener'; }
      }
      props[k] = val;
    }
    if (VOID[tag] || n.k.length === 0) return e(tag, props);
    return e(tag, props, renderList(n.k, scope));
  }
  function renderList(nodes, scope) { var out = []; for (var i = 0; i < nodes.length; i++) out.push(renderNode(nodes[i], scope, i)); return out; }

  function DCLogic(props) { React.Component.call(this, props); }
  DCLogic.prototype = Object.create(React.Component.prototype);
  DCLogic.prototype.constructor = DCLogic;
  DCLogic.prototype.render = function () {
    var vals = this.renderVals ? this.renderVals() : {};
    var kids = renderList(this.constructor.__spec, { vals: vals, locals: {} });
    return kids.length === 1 ? kids[0] : e(React.Fragment, null, kids);
  };

  // class-syntax screens extend DCLogic; give it class semantics
  var DCBase = (function () { try { return new Function('React', 'return class DCLogic extends React.Component {}')(React); } catch (err) { return null; } })();
  if (DCBase) { DCBase.prototype.render = DCLogic.prototype.render; DCLogic = DCBase; }

  var cache = {};
  function screenComponent(name) {
    if (cache[name]) return cache[name];
    var s = SCREENS[name];
    var Comp = new Function('DCLogic', 'React', s.js + '\n;return Component;')(DCLogic, React);
    var doc = new DOMParser().parseFromString('<!doctype html><html><body>' + s.tpl + '</body></html>', 'text/html');
    Comp.__spec = compile(doc.body.childNodes);
    cache[name] = Comp;
    return Comp;
  }

  function current() { var h = (location.hash || '').replace(/^#\/?/, ''); return SCREENS[h] ? h : 'Start'; }

  class Boundary extends React.Component {
    constructor(p) { super(p); this.state = { err: null }; }
    static getDerivedStateFromError(err) { return { err: err }; }
    render() {
      if (this.state.err) return e('div', { style: { padding: '40px', fontFamily: 'system-ui', color: '#1B1F27' } }, e('h2', null, 'This screen could not load'), e('p', null, String(this.state.err && this.state.err.message)), e('a', { href: '#/Start' }, 'Back to the prototype map'));
      return this.props.children;
    }
  }

  class App extends React.Component {
    constructor(p) { super(p); this.state = { route: current(), w: window.innerWidth, h: window.innerHeight }; this.onHash = this.onHash.bind(this); this.onResize = this.onResize.bind(this); }
    componentDidMount() { window.addEventListener('hashchange', this.onHash); window.addEventListener('resize', this.onResize); this.title(); }
    componentWillUnmount() { window.removeEventListener('hashchange', this.onHash); window.removeEventListener('resize', this.onResize); }
    onHash() { this.setState({ route: current() }, () => { window.scrollTo(0, 0); this.title(); }); }
    onResize() { this.setState({ w: window.innerWidth, h: window.innerHeight }); }
    title() { var s = SCREENS[this.state.route]; document.title = (s && s.title ? s.title + ' · ' : '') + 'Insurance Distribution Platform prototype'; }
    render() {
      var name = this.state.route; var s = SCREENS[name]; var Comp = screenComponent(name);
      var screen = e(Boundary, { key: name }, e(Comp, s.props));
      var chrome = name === 'Start' ? null : e('nav', { className: 'proto-chrome', 'aria-label': 'Prototype navigation' },
        e('a', { href: '#/Start', className: 'proto-pill' }, '⌂ Map'),
        e('button', { type: 'button', className: 'proto-pill', onClick: function () { history.back(); } }, '‹ Back'));
      if (s.kind !== 'phone') return e('div', { className: 'web' }, chrome, screen);
      var narrow = this.state.w < 560;
      var scale = narrow ? Math.min(1.15, this.state.w / 390) : Math.min(1, (this.state.h - 56) / 868);
      var frame = narrow ? e('div', { className: 'phone bare', style: { transform: 'scale(' + scale + ')' } }, screen)
        : e('div', { className: 'phone', style: { transform: 'scale(' + scale + ')' } }, screen);
      return e('div', { className: 'stage' + (narrow ? ' narrow' : '') }, chrome,
        e('div', { className: 'phone-slot', style: { width: (narrow ? 390 : 406) * scale + 'px', height: (narrow ? 844 : 868) * scale + 'px' } }, frame),
        narrow ? null : e('div', { className: 'stage-caption' }, s.title));
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
})();
