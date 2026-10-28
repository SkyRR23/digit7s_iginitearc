import type { RoomView, SpecialRole } from '@ashfall/shared';
import { emptyTableSelection, type TableSelection } from './tabletop-components';
import { roleArt, roleSymbol, roleDescriptions } from './role-art';
import { coverRolePanel } from './role-panel';
import { clearDaySelection } from './day-panel';
import { rememberPrivatePowerTargets, forgetPrivatePowerTargets } from './game-moments';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
const abilities: Partial<Record<SpecialRole, { name: string; prompt: string }>> = {
  SLEUTH: { name: 'Investigate', prompt: 'Learn their allegiance privately. Close the result quickly to avoid being discovered.' },
  HERBALIST: { name: 'Set a remedy', prompt: 'Protect them from one harmful card or night attack. An unused remedy fades at Dawn.' },
  GOSSIP: { name: 'Compare allegiances', prompt: 'Privately learn whether these two players share an allegiance.' },
  HEXER: { name: 'Cast a hex', prompt: 'Suppress one active protection on this player tonight. The result stays secret.' },
};
let view: RoomView | null = null;
let blocked = true;
let dispatch: (target: string, second?: string) => Promise<boolean> = async () => false;
let aiming = false;
let targets: string[] = [];
let context = '';
let dialog: HTMLDialogElement | null = null;
let returnFocus: HTMLElement | null = null;

function available(): boolean {
  return !!view?.role && !!abilities[view.role.kind] && view.role.ability === 'AVAILABLE' && !blocked &&
    !!view.deal?.players.find(p => p.playerId === view?.you?.playerId)?.alive &&
    view.phase === (view.role.kind === 'HEXER' ? 'NIGHT' : 'DAY') &&
    (view.day?.deadline ?? 0) > Date.now();
}
function eligible(): string[] {
  return available() ? (view?.deal?.players ?? []).filter(p => p.alive && p.playerId !== view?.you?.playerId &&
    !targets.includes(p.playerId) && !(view?.role?.kind === 'HERBALIST' && view.day?.players.find(s => s.playerId === p.playerId)?.remedy))
    .map(p => p.playerId) : [];
}
function announce(): void {
  const role = view?.role;
  const selection: TableSelection = aiming && role ? {
    ...emptyTableSelection(), validTargetIds: eligible(), selectedTargetId: targets[0] ?? '', secondTargetId: targets[1] ?? '',
    power: { name: abilities[role.kind]!.name, description: targets.length && role.kind === 'GOSSIP' ? 'Choose a second player to compare.' : abilities[role.kind]!.prompt, art: roleArt(role.kind) },
  } : emptyTableSelection();
  document.dispatchEvent(new CustomEvent('ashfall:power-selection', { detail: selection }));
  const button = document.getElementById('role-power');
  button?.setAttribute('aria-pressed', String(aiming));
}
export function cancelRolePower(): void {
  const wasAiming = aiming;
  aiming = false; targets = [];
  dialog?.close(); dialog?.remove(); dialog = null;
  if (wasAiming) announce();
}
export function beginRolePower(): void {
  if (!available()) return;
  if (aiming) { cancelRolePower(); return; }
  clearDaySelection(); coverRolePanel();
  aiming = true; targets = []; announce();
  document.querySelector<HTMLElement>('#seats .is-valid-target')?.focus({ preventScroll: true });
}
export function selectRolePowerTarget(id: string): boolean {
  if (!aiming || !eligible().includes(id) || dialog) return false;
  targets.push(id); announce();
  if (view?.role?.kind === 'GOSSIP' && targets.length < 2) {
    document.querySelector<HTMLElement>('#seats .is-valid-target')?.focus({ preventScroll: true }); return true;
  }
  const role = view!.role!;
  const ability = abilities[role.kind]!;
  const names = targets.map(target => view!.players.find(p => p.id === target)?.name ?? 'A player');
  const question = role.kind === 'HERBALIST' ? `Set a remedy for ${names.join(' and ')}?`
    : role.kind === 'HEXER' ? `Hex ${names.join(' and ')} tonight?`
    : role.kind === 'GOSSIP' ? `Compare ${names.join(' and ')}?` : `Investigate ${names.join(' and ')}?`;
  returnFocus = document.activeElement as HTMLElement | null;
  dialog = document.createElement('dialog'); dialog.id = 'power-confirmation'; dialog.className = 'power-confirmation';
  dialog.setAttribute('aria-labelledby', 'power-question'); dialog.setAttribute('aria-describedby', 'power-description');
  dialog.innerHTML = `<span class="eyebrow">YOUR PRIVATE ABILITY</span><img src="${roleArt(role.kind)}" alt=""><h2 id="power-question">${escape(question)}</h2><p id="power-description">${ability.prompt}</p><p class="power-cost">${role.kind === 'HERBALIST' ? 'Commits your remedy until it is used or fades.' : 'Uses your once-per-match ability.'}${view?.phase === 'DAY' ? ' Does not use your card turn.' : ''}</p><div class="power-decisions"><button id="power-no" type="button">No, go back</button><button id="power-yes" type="button" class="primary">Yes, ${ability.name.toLowerCase()}</button></div>`;
  document.body.append(dialog); dialog.showModal();
  // Focus the safe action. Enter never accidentally spends a once-per-match ability.
  dialog.querySelector<HTMLButtonElement>('#power-no')?.focus();
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancelRolePower(); document.getElementById('role-power')?.focus(); });
  dialog.querySelector('#power-no')?.addEventListener('click', () => {
    dialog?.close(); dialog?.remove(); dialog = null; targets = []; announce(); returnFocus?.focus();
  });
  dialog.querySelector('#power-yes')?.addEventListener('click', async () => {
    if (!available() || !targets.length) { cancelRolePower(); return; }
    const chosen = [...targets]; cancelRolePower();
    rememberPrivatePowerTargets(view, chosen);
    try { await dispatch(chosen[0]!, chosen[1]); } finally { forgetPrivatePowerTargets(); }
    document.getElementById('role-power')?.focus();
  });
  return true;
}
export function renderPowerControls(next: RoomView | null, disabled: boolean,
  use: (target: string, second?: string) => Promise<boolean>): void {
  view = next; blocked = disabled; dispatch = use;
  const key = `${view?.deal?.matchId}:${view?.phase}:${view?.you?.playerId}:${view?.role?.kind}`;
  if (context !== key || !available() || targets.some(id => !view?.deal?.players.find(p => p.playerId === id)?.alive)) cancelRolePower();
  context = key;
  const root = document.getElementById('power-dock');
  if (!root) return;
  const role = view?.role;
  root.hidden = !role || !view?.day;
  if (root.hidden || !role) { root.replaceChildren(); return; }
  const ability = abilities[role.kind];
  const status = role.ability === 'USED' ? 'Power used' : role.ability === 'ACTIVE' ? 'Remedy active' : available()
    ? aiming ? 'Choose a player · Esc to cancel' : 'Choose a player' : role.kind === 'HEXER' ? 'Available at Night' : 'Available during Day';
  root.innerHTML = `<button id="role-power" type="button" aria-label="${ability?.name ?? 'Role information'}" aria-pressed="${aiming}" ${ability && !available() ? 'disabled' : ''}><span class="power-symbol">${roleSymbol(role.kind)}</span><span><b>${ability?.name ?? 'Your role'}</b><small>${ability ? status : 'View your role & win condition'}</small></span>${ability && available() ? '<span class="power-ready" aria-hidden="true"></span>' : ''}</button><button id="power-info" type="button" aria-label="Read your private role description">?</button>`;
  root.querySelector('#role-power')?.addEventListener('click', () => ability ? beginRolePower() : document.getElementById('role-toggle')?.click());
  root.querySelector('#power-info')?.addEventListener('click', () => { cancelRolePower(); document.getElementById('role-toggle')?.click(); });
  root.title = roleDescriptions[role.kind] ?? '';
  if (aiming) announce();
}
document.addEventListener('ashfall:choose-card', cancelRolePower);
document.addEventListener('ashfall:choose-role', beginRolePower);
document.addEventListener('keydown', event => { if (event.key === 'Escape') cancelRolePower(); });
window.addEventListener('blur', cancelRolePower);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelRolePower(); });
