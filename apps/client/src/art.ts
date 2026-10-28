import type { Avatar } from '@ashfall/shared';
const motifs: Record<Avatar, string> = {
  lantern: '<path d="M27 24h26l-3 35H30zM32 24v-8q8-9 16 0v8M26 62h28M40 31v20"/><path d="m40 33-6 12 6 8 6-8z" fill="currentColor"/>',
  moth: '<path d="M40 30Q9 9 14 43q5 20 24 5M40 30Q71 9 66 43q-5 20-24 5M40 25v36M35 17l5 8 5-8M20 34l12 7M60 34l-12 7"/>',
  reed: '<path d="M31 65q13-24 5-47M43 64q-1-19 13-36M34 45Q15 43 17 29q14 1 17 16M42 51q20 0 21-15-15 1-21 15"/><path d="M36 12v15M55 21v11" stroke-width="7"/>',
  thorn: '<path d="M40 66V17M40 49 22 31M40 39l18-17M40 59l20-14M26 35l-1-13M32 41l-13 1M49 31l-1-13M53 50l12 2M40 23l-8-9"/>',
  bell: '<path d="M20 54h40l-7-12V31q0-15-13-15T27 31v11zM35 62q5 7 10 0M40 10v6M20 29l-5 5M60 29l5 5"/><path d="M34 31q0-8 6-8"/>',
  moon: '<path d="M49 14a27 27 0 1 0 17 39C39 63 25 30 49 14Z"/><path d="m59 20 2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="currentColor"/>',
};
export function emblem(avatar: Avatar, className = ''): string {
  return `<svg class="emblem ${className}" viewBox="0 0 80 80" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${motifs[avatar]}</svg>`;
}
export const landscape = `<svg class="landscape" viewBox="0 0 680 260" aria-hidden="true"><circle cx="345" cy="88" r="57" fill="#c9b782"/><path d="m0 158 83-41 83 30 73-20 88 32 99-47 91 30 163-46v164H0Z" fill="#35413b"/><path d="m0 202 116-39 88 31 134-28 113 30 130-50 99 41v73H0Z" fill="#222e2a"/><g fill="#171e1d"><path d="m231 186 41-44 44 44v49h-85zM363 171l48-54 49 54v64h-97zM477 194l29-35 37 35v41h-66z"/><path d="M393 145v-40h9v40M281 166v-40h8v40"/></g><g fill="#c19b5a"><path d="M268 193h10v14h-10zM407 171h10v18h-10zM503 201h8v11h-8z"/></g><path d="M0 243q132-34 259-6t421-12v35H0Z" fill="#171e1d"/></svg>`;
