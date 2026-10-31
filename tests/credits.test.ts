import {describe,it,expect} from 'vitest';
import {AUDIO_CREDITS} from '../apps/client/src/credits-data';
import {creditsText,renderCredits} from '../apps/client/src/credits';

describe('unified audio credits',()=>{
 it('puts Phoenix first in a single audio section while retaining separate project credits',()=>{
  const html=renderCredits();
  expect(html).toContain('Music, Ambience &amp; Sound Credits');
  expect(html).not.toContain('id="credits-required"');
  expect(html).not.toContain('id="credits-cc0"');
  expect(html.indexOf('Phoenix (2026)')).toBeLessThan(html.indexOf('Fireplace #2'));
  expect(html).toContain('CC BY 4.0 · Attribution Required');
  expect(html.indexOf('id="credits-project"')).toBeGreaterThan(html.indexOf('credits-sources'));
 });
 it('preserves the exact required attribution, original links and modification notice',()=>{
  const item=AUDIO_CREDITS.find(item=>item.required)!;
  const html=renderCredits();
  expect(html).toContain(`<blockquote>${item.attribution}</blockquote>`);
  expect(html).toContain(`href="${item.sourceUrl}"`);
  expect(html).toContain(`href="${item.licenceUrl}"`);
  expect(html).toContain(item.modifications);
  expect(html).not.toContain('<p>By <strong>');
  expect(html.match(/class="credits-source/g)).toHaveLength(AUDIO_CREDITS.length+1); // grid plus one entry per source
 });
 it('keeps every field in the copied credits unchanged and in the original data order',()=>{
  const expected=['ASHFALL COUNCIL — AUDIO CREDITS',...AUDIO_CREDITS.map(item=>`${item.title.replace(/ — Free Sound Effect Download \| BigSoundBank$/,'')} — ${item.creator}\n${item.required?item.attribution:'CC0-1.0; attribution optional.'}\nSource: ${item.sourceUrl}\nLicence: ${item.licenceUrl}\nModifications: ${item.modifications}\nFiles: ${item.files.join(', ')}\nUse: ${item.uses.join('; ')}`)].join('\n\n');
  expect(creditsText()).toBe(expected);
 });
});
