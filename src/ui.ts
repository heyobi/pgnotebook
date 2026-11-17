// Small DOM helpers shared by every view.
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { blobToBase64 } from './storage';

export const native = Capacitor.isNativePlatform();
export const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export type Child = Node | string | null | undefined | false;
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const icon = (name: string) => h('span', { class: `i i-${name}`, 'aria-hidden': 'true' });

export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.classList.add('out'), 2400);
  setTimeout(() => t.remove(), 2800);
}

export function sheet(title: string, actions: { label: string; danger?: boolean; run: () => void }[]) {
  const close = () => back.remove();
  const back = h('div', { class: 'sheet-back', onclick: (e: Event) => e.target === back && close() },
    h('div', { class: 'sheet' },
      h('div', { class: 'sheet-group' },
        h('div', { class: 'sheet-title' }, title),
        actions.map((a) => h('button', { class: `sheet-btn${a.danger ? ' danger' : ''}`, onclick: () => { close(); a.run(); } }, a.label))),
      h('button', { class: 'sheet-btn cancel', onclick: close }, 'Cancel')));
  document.body.append(back);
}

export function confirmBox(title: string, body: string, ok: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => { back.remove(); resolve(v); };
    const back = h('div', { class: 'sheet-back center' },
      h('div', { class: 'dialog' },
        h('div', { class: 'dialog-title' }, title),
        h('div', { class: 'dialog-body' }, body),
        h('div', { class: 'dialog-actions' },
          h('button', { onclick: () => done(false) }, 'Cancel'),
          h('button', { class: danger ? 'danger' : 'primary', onclick: () => done(true) }, ok))));
    document.body.append(back);
  });
}

export function promptBox(title: string, label: string, value = '', ok = 'OK'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { class: 'field', value, 'aria-label': label, placeholder: label, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const done = (v: string | null) => { back.remove(); resolve(v); };
    input.onkeydown = (e) => e.key === 'Enter' && done(input.value.trim() || null);
    const back = h('div', { class: 'sheet-back center' },
      h('div', { class: 'dialog' },
        h('div', { class: 'dialog-title' }, title),
        h('div', { class: 'dialog-body' }, input),
        h('div', { class: 'dialog-actions' },
          h('button', { onclick: () => done(null) }, 'Cancel'),
          h('button', { class: 'primary', onclick: () => done(input.value.trim() || null) }, ok))));
    document.body.append(back);
    setTimeout(() => input.focus(), 50);
  });
}

/** Full-screen modal page (paywall, extension details). Returns a close function. */
export function modal(content: HTMLElement, onClose?: () => void): () => void {
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 200); onClose?.(); };
  const back = h('div', { class: 'modal-back' },
    h('div', { class: 'modal' },
      h('button', { class: 'modal-close', 'aria-label': 'Close', onclick: close }, icon('close')),
      content));
  document.body.append(back);
  return close;
}

export async function shareFile(name: string, data: Blob | string, mime: string) {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  if (native) {
    const w = await Filesystem.writeFile({ directory: Directory.Cache, path: name, data: await blobToBase64(blob) });
    await Share.share({ title: name, files: [w.uri] }).catch(() => {});
  } else {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}

export function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file' }) as HTMLInputElement;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'notebook';

export function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function fmtDate(t: number) {
  const d = new Date(t);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
