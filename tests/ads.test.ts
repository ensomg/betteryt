/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanFeed, cleanPlayerResponse, CLEAN_ENDPOINTS } from '../src/shared/ad-rules';

describe('player response cleaning', () => {
  it('removes only ad fields, keeps everything else', () => {
    const resp = {
      videoDetails: { videoId: 'x' },
      streamingData: { formats: [1] },
      adPlacements: [1],
      playerAds: [2],
      adSlots: [3],
      adBreakHeartbeatParams: 'p',
    };
    expect(cleanPlayerResponse(resp)).toBe(4);
    expect(resp).toEqual({ videoDetails: { videoId: 'x' }, streamingData: { formats: [1] } });
  });

  it('cleans nested /next player responses and ignores junk', () => {
    const next = { playerResponse: { adPlacements: [], videoDetails: {} } };
    expect(cleanPlayerResponse(next)).toBe(1);
    expect(next.playerResponse).toEqual({ videoDetails: {} });
    expect(cleanPlayerResponse(null)).toBe(0);
    expect(cleanPlayerResponse('str')).toBe(0);
  });
});

describe('feed cleaning', () => {
  it('drops ad items from nested arrays, keeps videos', () => {
    const data = {
      contents: {
        richGridRenderer: {
          contents: [
            { richItemRenderer: { content: { videoRenderer: { videoId: 'a' } } } },
            { richItemRenderer: { content: { adSlotRenderer: {} } } },
            { richSectionRenderer: { content: { statementBannerRenderer: {} } } },
            { richItemRenderer: { content: { videoRenderer: { videoId: 'b' } } } },
          ],
        },
      },
      results: [{ searchPyvRenderer: {} }, { videoRenderer: { videoId: 'c' } }],
    };
    expect(cleanFeed(data)).toBe(3);
    const ids = JSON.stringify(data).match(/"videoId":"(\w)"/g);
    expect(ids).toEqual(['"videoId":"a"', '"videoId":"b"', '"videoId":"c"']);
  });

  it('is bounded on huge inputs', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 1000; i++) cur = (cur.x = {}) as Record<string, unknown>;
    expect(() => cleanFeed(deep)).not.toThrow();
  });

  it('matches only the endpoints we clean', () => {
    expect(CLEAN_ENDPOINTS.test('https://www.youtube.com/youtubei/v1/player?key=1')).toBe(true);
    expect(CLEAN_ENDPOINTS.test('https://www.youtube.com/youtubei/v1/browse')).toBe(true);
    expect(CLEAN_ENDPOINTS.test('https://www.youtube.com/youtubei/v1/log_event?x')).toBe(false);
    expect(CLEAN_ENDPOINTS.test('https://www.youtube.com/youtubei/v1/player/heartbeat')).toBe(false);
  });
});

describe('static DNR ruleset', () => {
  const rules = JSON.parse(
    readFileSync(new URL('../src/rules/ads-static.json', import.meta.url), 'utf8'),
  ) as Array<{
    id: number;
    priority: number;
    action: { type: string };
    condition: Record<string, unknown>;
  }>;
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')) as {
    declarative_net_request: { rule_resources: Array<{ id: string; path: string; enabled: boolean }> };
  };

  it('has unique positive ids and valid actions', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rules) {
      expect(Number.isInteger(r.id) && r.id > 0).toBe(true);
      expect(['block', 'allow', 'redirect', 'upgradeScheme', 'modifyHeaders', 'allowAllRequests']).toContain(
        r.action.type,
      );
      expect(r.condition.urlFilter ?? r.condition.requestDomains).toBeTruthy();
    }
  });

  it('only applies to requests made by YouTube pages', () => {
    for (const r of rules) expect(r.condition.initiatorDomains).toEqual(['youtube.com']);
  });

  it('never blocks the player, video streams or the ad-status script', () => {
    const text = JSON.stringify(rules);
    expect(text).not.toMatch(/googlevideo|\/youtubei\/v1\/player"|static\.doubleclick/);
  });

  it('is declared in the manifest, disabled until settings enable it', () => {
    const res = manifest.declarative_net_request.rule_resources.find((x) => x.id === 'ads-static');
    expect(res).toMatchObject({ path: 'rules/ads-static.json', enabled: false });
  });
});
