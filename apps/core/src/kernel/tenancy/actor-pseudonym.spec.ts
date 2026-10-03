import { pseudonymiseActor } from './actor-pseudonym';

describe('actor-pseudonym', () => {
  it('returns a pseudonym with usr_ prefix', () => {
    const pseudonym = pseudonymiseActor('user_001', 'pepper');

    expect(pseudonym).toMatch(/^usr_[0-9a-f]{12}$/);
  });

  it('generates the same pseudonym for the same userRef and pepper', () => {
    const userRef = 'user_001';
    const pepper = 'pepper';

    const pseudonym1 = pseudonymiseActor(userRef, pepper);
    const pseudonym2 = pseudonymiseActor(userRef, pepper);

    expect(pseudonym1).toBe(pseudonym2);
  });

  it('generates different pseudonyms for different userRefs', () => {
    const pepper = 'pepper';

    const pseudonym1 = pseudonymiseActor('user_001', pepper);
    const pseudonym2 = pseudonymiseActor('user_002', pepper);

    expect(pseudonym1).not.toBe(pseudonym2);
  });

  it('generates different pseudonyms for different peppers', () => {
    const userRef = 'user_001';

    const pseudonym1 = pseudonymiseActor(userRef, 'pepper1');
    const pseudonym2 = pseudonymiseActor(userRef, 'pepper2');

    expect(pseudonym1).not.toBe(pseudonym2);
  });
});
