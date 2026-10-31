import type { RoomView } from '@ashfall/shared';
import { cardTitle } from './card-info';
import { cancelRolePower } from './power-controls';
import type { TableSelection } from './tabletop-components';

export function installMobileLayout(cancelSelection: () => void) {
  const phone = matchMedia('(max-width: 680px), (max-width: 950px) and (max-height: 500px)');
  const lobby = document.getElementById('lobby')!;
  const preferences = document.querySelector<HTMLElement>('.game-preferences')!;
  const heading = document.querySelector<HTMLElement>('.room-heading')!;
  const controls = document.getElementById('controls')!;
  const hud = document.getElementById('match-hud')!;
  const hand = document.getElementById('day-panel')!;
  // Reuse live controls and handlers; restore their original positions on desktop.
  const slots = [preferences, heading, controls, hud, hand].map(node => {
    const slot = document.createComment('Original control position');
    node.before(slot);
    return {node, slot};
  });
  const menu = document.createElement('dialog');
  menu.id = 'mobile-menu';
  menu.setAttribute('aria-labelledby', 'mobile-menu-title');
  menu.innerHTML = '<header><div><span class="eyebrow">ASHFALL COUNCIL</span><h2 id="mobile-menu-title">Room & settings</h2></div><button id="mobile-menu-close" type="button" aria-label="Close room and settings">×</button></header><div class="mobile-room-tools"></div><h3>Preferences & help</h3><div class="mobile-preferences"></div><div class="mobile-host-tools"></div>';
  document.body.append(menu);
  const menuButton = document.createElement('button');
  menuButton.id = 'mobile-menu-toggle';
  menuButton.type = 'button';
  menuButton.textContent = 'Menu';
  menuButton.setAttribute('aria-haspopup', 'dialog');
  menuButton.setAttribute('aria-controls', menu.id);
  menuButton.onclick = () => menu.showModal();
  document.querySelector('.topbar')!.append(menuButton);
  menu.querySelector('#mobile-menu-close')!.addEventListener('click', () => menu.close());
  menu.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && !['motion-toggle', 'sound-toggle'].includes(button.id)) menu.close();
  });

  const nav = document.createElement('nav');
  nav.id = 'mobile-nav';
  nav.setAttribute('aria-label', 'Game views');
  const icons = {
    table: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="7" rx="1"/><rect x="14" y="15" width="7" height="7" rx="1"/>',
    you: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
    chat: '<path d="M4 4h16v13H9l-5 4zM8 9h8m-8 4h5"/>',
  };
  nav.innerHTML = (Object.keys(icons) as (keyof typeof icons)[]).map(key => `<button type="button" data-mobile-view="${key}" aria-pressed="${key === 'table'}"><svg viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${icons[key]}</svg><span>${key === 'table' ? 'Table' : key === 'you' ? 'You' : 'Chat'}</span></button>`).join('');
  lobby.append(nav);
  const chatButton = nav.querySelector<HTMLButtonElement>('[data-mobile-view="chat"]')!;
  chatButton.removeAttribute('aria-pressed');
  chatButton.setAttribute('aria-controls', 'council-panel');
  chatButton.setAttribute('aria-expanded', 'false');
  const selection = document.createElement('div');
  selection.id = 'mobile-selection';
  selection.hidden = true;
  selection.innerHTML = '<div><small>CHOOSE A PLAYER</small><strong></strong></div><button type="button">Cancel</button>';
  selection.querySelector('button')!.onclick = () => { cancelRolePower(); cancelSelection(); };
  lobby.insertBefore(selection, lobby.querySelector('.room-layout'));
  let tab = 'table';
  let current: RoomView | null = null;
  let previousPhase = '';
  let previousSelection = '';

  function showTab(next: string) {
    tab = next;
    document.body.dataset.mobileView = tab;
    nav.querySelectorAll<HTMLButtonElement>('[aria-pressed]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mobileView === tab)));
    if (phone.matches) {
      document.getElementById('council-panel')!.classList.remove('is-chat-open');
      document.getElementById('chat-toggle')!.setAttribute('aria-expanded', 'false');
      chatButton.setAttribute('aria-expanded', 'false');
      document.querySelector('.room-layout')!.scrollTop = 0;
    }
  }
  nav.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-mobile-view]');
    if (!button) return;
    if (button.dataset.mobileView === 'chat') { document.getElementById('chat-toggle')!.click(); return; }
    showTab(button.dataset.mobileView!);
  });

  function placeControls() {
    document.body.classList.toggle('mobile-layout', phone.matches);
    for (const {node, slot} of slots) {
      const destination = !phone.matches ? null : node === preferences ? menu.querySelector('.mobile-preferences')
        : !current?.deal ? null : node === heading ? menu.querySelector('.mobile-room-tools')
        : node === controls && current.phase !== 'GAME_OVER' ? menu.querySelector('.mobile-host-tools')
        : node === hud || node === hand ? lobby : null;
      if (destination) {
        if (node.parentNode !== destination) {
          if (node === hud) lobby.insertBefore(hud, selection);
          else if (node === hand) lobby.insertBefore(hand, nav);
          else destination.append(node);
        }
      } else if (node.parentNode !== slot.parentNode) slot.after(node);
    }
    if (!phone.matches) { menu.close(); return; }
  }
  phone.addEventListener('change', placeControls);
  document.addEventListener('ashfall:day-selection', event => {
    const detail = (event as CustomEvent<TableSelection>).detail;
    const key = detail.selectedCardId;
    selection.hidden = !key;
    selection.querySelector('strong')!.textContent = detail.selectedCardKind ? cardTitle(detail.selectedCardKind) : '';
    selection.querySelector('small')!.textContent = detail.selectedCardKind === 'COUNCIL_BELL' || (detail.selectedTargetId && !detail.validTargetIds.length) ? 'REVIEW YOUR CHOICE' : detail.selectedTargetId && detail.selectedCardKind === 'SCAPEGOAT' ? 'CHOOSE THE SECOND PLAYER' : 'CHOOSE A PLAYER';
    if (phone.matches && key && key !== previousSelection) showTab('table');
    previousSelection = key;
  });
  document.addEventListener('ashfall:power-selection', event => {
    const power = (event as CustomEvent<TableSelection>).detail.power;
    if (power) {
      selection.hidden = false;
      selection.querySelector('small')!.textContent = 'YOUR PRIVATE POWER · CHOOSE A PLAYER';
      selection.querySelector('strong')!.textContent = power.name;
      if (phone.matches) showTab('table');
    } else if (!previousSelection) selection.hidden = true;
  });
  showTab('table');
  placeControls();
  return {
    update(view: RoomView | null) {
      const changedRoom = current?.code !== view?.code;
      current = view;
      if (changedRoom || (view?.phase !== previousPhase && ['NIGHT', 'DAWN', 'GAME_OVER'].includes(view?.phase ?? ''))) showTab('table');
      previousPhase = view?.phase ?? '';
      hand.dataset.handCount = String(view?.hand?.length ?? 0);
      hud.querySelector('.mobile-turn-time')?.remove();
      if (view?.day && view.phase === 'DAY') {
        const timer = document.createElement('strong');
        timer.className = 'mobile-turn-time';
        timer.dataset.deadline = String(view.day.deadline ?? 0);
        timer.setAttribute('aria-label', 'Turn time remaining');
        hud.append(timer);
      }
      placeControls();
    },
  };
}
