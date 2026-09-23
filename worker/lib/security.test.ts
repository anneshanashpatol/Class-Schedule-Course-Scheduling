import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './security';

describe('密码哈希', () => {
  it('使用 Cloudflare Workers 支持的 PBKDF2 迭代上限', async () => {
    const encoded = await hashPassword('12345');
    const [, iterations] = encoded.split('$');

    expect(Number(iterations)).toBe(100_000);
    await expect(verifyPassword('12345', encoded)).resolves.toBe(true);
    await expect(verifyPassword('错误密码', encoded)).resolves.toBe(false);
  });
});
