import type { RoomView } from '@ashfall/shared';

/** Public chat only. Initial/replayed snapshots never create historical toasts. */
export function installChatNotifications() {
  const panel = document.getElementById('council-panel')!;
  const feed = document.getElementById('feed')!;
  const buttons = [document.getElementById('chat-toggle')!, document.querySelector<HTMLElement>('#mobile-nav [data-mobile-view="chat"]')!];
  const badges = buttons.map(button => {
    const badge = document.createElement('span');
    badge.className = 'chat-unread-badge'; badge.hidden = true; badge.setAttribute('aria-hidden','true');
    button.append(badge); return badge;
  });
  const toast = document.createElement('aside');
  toast.id = 'chat-toast'; toast.hidden = true; toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite');
  const sender = document.createElement('strong'), message = document.createElement('p');
  toast.append(sender,message); document.body.append(toast);
  let room = '', connected = false;
  let seen = new Set<string>(), unread = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const obscured = () => document.body.classList.contains('table-paused') || !!document.querySelector('#game-moment,#role-panel.is-open,#private-panel.is-open,dialog[open],#decision-panel:not([hidden])');
  const visible = () => !document.hidden && connected && !obscured() && panel.getClientRects().length > 0;
  const atBottom = () => feed.scrollHeight-feed.scrollTop-feed.clientHeight < 36;
  function paint() {
    const count = unread.size;
    for (let i=0;i<buttons.length;i++) {
      badges[i]!.hidden = !count; badges[i]!.textContent = count > 99 ? '99+' : String(count);
      buttons[i]!.setAttribute('aria-label',count ? `Open council chat, ${count} unread message${count === 1 ? '' : 's'}` : 'Open council chat and event log');
    }
    if (!count) { toast.hidden = true; clearTimeout(timer); }
  }
  function readVisible() {
    if (visible() && atBottom()) { unread.clear(); paint(); }
  }
  feed.addEventListener('scroll',readVisible,{passive:true});
  document.addEventListener('click',event => {
    if ((event.target as Element).closest('#chat-toggle,[data-mobile-view="chat"]') && visible()) feed.scrollTop = feed.scrollHeight;
    requestAnimationFrame(readVisible);
  });
  document.addEventListener('visibilitychange',() => { if (document.hidden) toast.hidden = true; else readVisible(); });
  return {
    update(view: RoomView | null, isConnected: boolean) {
      connected = isConnected;
      if (!view || view.code !== room) {
        room = view?.code ?? ''; unread.clear(); seen = new Set(view?.feed.map(entry => entry.id)); paint(); return;
      }
      const ids = new Set(view.feed.map(entry => entry.id));
      unread = new Set([...unread].filter(id => ids.has(id)));
      const fresh = view.feed.filter(entry => entry.kind === 'chat' && !seen.has(entry.id));
      seen = ids;
      for (const entry of fresh) unread.add(entry.id);
      if (visible() && atBottom()) unread.clear();
      else if (fresh.length && connected && !document.hidden && !visible()) {
        const last = fresh[fresh.length-1]!;
        sender.textContent = `${last.name ?? 'Council'} · new message`;
        message.textContent = last.text.length > 150 ? `${last.text.slice(0,147)}…` : last.text;
        toast.hidden = false; clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; },5000);
      }
      paint();
    },
  };
}
