export const tokens = { ink: '#17233B', mist: '#EEF2F7', surface: '#FFFFFF', slate: '#5D6B82', brand: '#0F7C8A', success: '#0F8A5F', alert: '#D92D3A', amber: '#B76E00' };
function luminance(hex: string): number {
  const c = hex.replace('#', '').match(/.{2}/g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
export function contrast(a: string, b: string): number { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
export function safeAccent(hex: string): string {
  if (!/^#[\da-f]{6}$/i.test(hex)) return tokens.brand;
  let values = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16));
  let result = hex;
  while (['#FFFFFF',tokens.mist,'#E8F4F3'].some(background=>contrast(result,background)<4.5)) {
    values = values.map(v => Math.floor(v * .92));
    result = '#' + values.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return result;
}
export const requiredBlocks = ['today', 'quickActions', 'adSlot', 'privacy', 'emergency', 'poweredBy'] as const;
export function validateLayout(blocks: string[]) {
  const valid = new Set<string>([...requiredBlocks, 'banner', 'events', 'principalMessage']);
  return blocks.length <= 12 && new Set(blocks).size === blocks.length && blocks.every(b => valid.has(b)) && requiredBlocks.every(b => blocks.includes(b));
}
