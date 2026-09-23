import { describe, expect, it } from 'vitest';
import { authenticatedLandingPath } from './navigation';

describe('登录后的默认页面', () => {
  it('手机端进入排课管理', () => {
    expect(authenticatedLandingPath(true)).toBe('/schedules');
  });

  it('桌面端进入课程表', () => {
    expect(authenticatedLandingPath(false)).toBe('/calendar');
  });
});
